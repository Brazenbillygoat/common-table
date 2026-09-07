"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type OfflineCollection,
  type OfflineManifest,
  syncDifference,
} from "@/utils/offline-protocol";
import { readCollection } from "@/offline/storage";
import {
  appDownloadEstimate,
  appIsReady,
  checkPublications,
  offlineRegistration,
  removeOfflineDownloads,
  RevisionConflict,
  STORAGE_EVENT,
  syncPublications,
} from "@/offline/client";
import styles from "./offline.module.scss";

const dismissed = new Set<string>();
const size = (bytes: number) => `${Math.max(1, Math.ceil(bytes / 1024))} KiB`;
const availabilityText = {
  checking: "Checking saved downloads",
  empty: "No offline download saved yet",
  incomplete: "Offline download needs to be completed",
  ready: "Available offline",
  unavailable: "Offline availability could not be checked",
};
export function OfflineControls() {
  const [collection, setCollection] = useState<OfflineCollection | null>(null);
  const [availability, setAvailability] = useState<keyof typeof availabilityText>("checking");
  const [canRemove, setCanRemove] = useState(false);
  const [offer, setOffer] = useState<OfflineManifest | null>(null);
  const [appBytes, setAppBytes] = useState<number | null>(null);
  const [activity, setActivity] = useState<"checking" | "downloading" | "removing" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [offline, setOffline] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const automaticCheckAt = useRef(0);
  const active = useRef(false);
  const busy = activity !== null;

  const refreshStorage = useCallback(async () => {
    try {
      const [stored, filesReady, registration] = await Promise.all([
        readCollection(),
        appIsReady(),
        offlineRegistration(),
      ]);
      setCollection(stored);
      setAvailability(
        filesReady && stored ? "ready" : stored || registration ? "incomplete" : "empty",
      );
      setCanRemove(!!stored || !!registration);
      return { stored, filesReady };
    } catch {
      setAvailability("unavailable");
      setOffer(null);
      // Keep reset available even when an invalid or inaccessible saved copy
      // prevents us from discovering what remains on this device.
      setCanRemove(true);
      throw new Error(
        "Saved downloads could not be read. Try again or remove downloads to reset them.",
      );
    }
  }, []);
  const check = useCallback(
    async (manual = false) => {
      if (active.current) return;
      if (!manual && Date.now() - automaticCheckAt.current < 30_000) return;
      automaticCheckAt.current = Date.now();
      active.current = true;
      setActivity("checking");
      setError("");
      setMessage("");
      try {
        const { stored, filesReady } = await refreshStorage();
        if (!navigator.onLine) {
          setMessage("Reconnect to check for updates.");
          return;
        }
        const manifest = await checkPublications();
        const needsOffer = stored?.manifest.revision !== manifest.revision || !filesReady;
        if (needsOffer && (manual || !dismissed.has(manifest.revision))) {
          setAppBytes(filesReady ? 0 : await appDownloadEstimate());
          setOffer(manifest);
          setMessage("");
        } else {
          setOffer(null);
          if (manual)
            setMessage(needsOffer ? "Saved recipes kept." : "Your saved recipes are up to date.");
        }
        const registration = await offlineRegistration();
        if (registration) {
          await registration.update().catch(() => {});
          setUpdateReady(!!registration.waiting);
          const installing = registration.installing;
          if (installing)
            installing.addEventListener("statechange", () => {
              if (installing.state === "installed") setUpdateReady(!!registration.waiting);
            });
        }
      } catch (problem) {
        setError(
          problem instanceof Error ? problem.message : "Could not check for updates. Try again.",
        );
      } finally {
        active.current = false;
        setActivity(null);
      }
    },
    [refreshStorage],
  );

  useEffect(() => {
    function connect(event?: Event) {
      // A real reconnection gets a fresh check even if the last visit was recent.
      // Overlapping events still share the in-flight check; there is no polling.
      if (event?.type === "online") automaticCheckAt.current = 0;
      setOffline(!navigator.onLine);
      if (!active.current) void refreshStorage().catch(() => {});
      void check();
    }
    function storageChanged() {
      void refreshStorage().catch((problem: Error) => setError(problem.message));
    }
    function focus() {
      if (document.visibilityState === "visible") connect();
    }
    const channel = "BroadcastChannel" in window ? new BroadcastChannel(STORAGE_EVENT) : null;
    if (channel) channel.onmessage = storageChanged;
    connect();
    window.addEventListener("online", connect);
    window.addEventListener("offline", connect);
    window.addEventListener("pageshow", connect);
    window.addEventListener(STORAGE_EVENT, storageChanged);
    document.addEventListener("visibilitychange", focus);
    return () => {
      channel?.close();
      window.removeEventListener("online", connect);
      window.removeEventListener("offline", connect);
      window.removeEventListener("pageshow", connect);
      window.removeEventListener(STORAGE_EVENT, storageChanged);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [check, refreshStorage]);

  async function sync() {
    if (!offer || active.current) return;
    active.current = true;
    setActivity("downloading");
    setError("");
    setMessage("");
    try {
      await syncPublications(offer);
      await refreshStorage();
      setOffer(null);
      setMessage("Offline download complete.");
    } catch (problem) {
      setMessage("");
      if (!collection) setAvailability("incomplete");
      setCanRemove(true);
      setError(problem instanceof Error ? problem.message : "Download failed. Retry.");
      if (problem instanceof RevisionConflict) {
        setOffer(null);
        active.current = false;
        await check(true);
      }
    } finally {
      active.current = false;
      setActivity(null);
    }
  }
  async function remove() {
    if (active.current) return;
    active.current = true;
    setActivity("removing");
    setError("");
    setMessage("");
    try {
      await removeOfflineDownloads();
      setCollection(null);
      setAvailability("empty");
      setCanRemove(false);
      setUpdateReady(false);
      setOffer(null);
      setRemoveConfirm(false);
      setMessage("Offline downloads removed from this device.");
    } catch {
      setError("Some downloads could not be removed. Close other Common Table pages and retry.");
    } finally {
      active.current = false;
      setActivity(null);
    }
  }
  const difference = offer ? syncDifference(offer, collection) : null;
  const progress =
    activity === "checking"
      ? "Checking for updates…"
      : activity === "downloading"
        ? "Downloading recipes and app files…"
        : activity === "removing"
          ? "Removing offline downloads…"
          : message;
  return (
    <section className={styles.controls} aria-label="Offline recipes">
      <h2>Offline recipes</h2>
      <p role="status">
        {availabilityText[availability]}
        {offline ? " · You are offline" : ""}.
        {collection
          ? ` Last successful download: ${new Date(collection.syncedAt).toLocaleString()}.`
          : ""}
      </p>
      {offer && difference && !removeConfirm ? (
        <div className={styles.offer}>
          <p>
            {!collection
              ? "Save all published recipes and the app files needed to browse, search, and cook offline. No sign-in needed."
              : `${difference.added} new recipes, ${difference.changed} changed recipes, and ${difference.removed} removals. Later keeps your saved collection; online browsing still shows current publications.`}
          </p>
          <p>
            Estimated recipe download: {size(difference.bytes)}.
            {appBytes
              ? ` Initial or replacement app files: about ${size(appBytes)}.`
              : " App files are already saved."}{" "}
            Transfers include additional metadata.
          </p>
          <button type="button" onClick={() => void sync()} disabled={busy || offline}>
            Download now
          </button>{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              dismissed.add(offer.revision);
              setOffer(null);
              setMessage(
                collection
                  ? "Your saved recipes are kept. Check for updates whenever you are ready."
                  : "You can download later. Choose Check for updates when you are ready.",
              );
            }}
          >
            Later
          </button>
        </div>
      ) : null}
      {!removeConfirm ? (
        <>
          {!offer ? (
            <button type="button" disabled={busy || offline} onClick={() => void check(true)}>
              Check for updates
            </button>
          ) : null}{" "}
          {canRemove ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setRemoveConfirm(true);
                setMessage("");
                setError("");
              }}
            >
              Remove offline downloads
            </button>
          ) : null}
        </>
      ) : null}
      {removeConfirm ? (
        <div role="group" aria-label="Confirm removal">
          <p>
            Remove Common Table&apos;s downloaded recipes and offline app files from this device?
            Cloud recipes and sign-in data are kept.
          </p>
          <button type="button" disabled={busy} onClick={() => void remove()}>
            Confirm removal
          </button>{" "}
          <button type="button" disabled={busy} onClick={() => setRemoveConfirm(false)}>
            Cancel
          </button>
        </div>
      ) : null}
      {progress ? <p role="status">{progress}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {updateReady ? (
        <p role="status">
          An app update is ready. Close all Common Table pages, then reopen to use it. Your open
          recipes and unsaved edits stay as they are.
        </p>
      ) : null}
      <details className={styles.note}>
        <summary>About offline downloads</summary>
        <p>
          Downloads stay on this device and may be removed by your browser. They are not a permanent
          backup. Reconnect to download them again if needed. Editing needs an internet connection.
        </p>
      </details>
    </section>
  );
}
