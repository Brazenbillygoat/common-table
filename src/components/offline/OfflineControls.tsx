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
export function OfflineControls() {
  const [collection, setCollection] = useState<OfflineCollection | null>(null);
  const [ready, setReady] = useState(false);
  const [offer, setOffer] = useState<OfflineManifest | null>(null);
  const [appBytes, setAppBytes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [offline, setOffline] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const automaticCheckAt = useRef(0);
  const active = useRef(false);

  const refreshStorage = useCallback(async () => {
    const stored = await readCollection();
    const filesReady = await appIsReady();
    setCollection(stored);
    setReady(filesReady && !!stored);
    return { stored, filesReady };
  }, []);
  const check = useCallback(
    async (manual = false) => {
      if (active.current) return;
      if (!manual && Date.now() - automaticCheckAt.current < 30_000) return;
      automaticCheckAt.current = Date.now();
      active.current = true;
      setBusy(true);
      setError("");
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
          problem instanceof Error
            ? problem.message
            : "Offline storage is unavailable. Retry or remove downloads to reset it.",
        );
      } finally {
        active.current = false;
        setBusy(false);
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
      void refreshStorage().catch(() => setReady(false));
      void check();
    }
    function storageChanged() {
      void refreshStorage().catch(() => {
        setReady(false);
        setError("Saved storage is unavailable. Reconnect and retry.");
      });
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
    setBusy(true);
    setError("");
    setMessage("Downloading app files and recipes…");
    try {
      await syncPublications(offer);
      await refreshStorage();
      setOffer(null);
      setMessage("Offline download complete.");
    } catch (problem) {
      setMessage("");
      setError(problem instanceof Error ? problem.message : "Download failed. Retry.");
      if (problem instanceof RevisionConflict) {
        setOffer(null);
        active.current = false;
        await check(true);
      }
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await removeOfflineDownloads();
      setCollection(null);
      setReady(false);
      setOffer(null);
      setRemoveConfirm(false);
      setMessage("Offline downloads removed from this device.");
    } catch {
      setError("Some downloads could not be removed. Close other Common Table pages and retry.");
    } finally {
      setBusy(false);
    }
  }
  const difference = offer ? syncDifference(offer, collection) : null;
  return (
    <section className={styles.controls} aria-label="Offline recipes">
      <h2>Offline recipes</h2>
      <p role="status">
        {ready ? "Available offline" : "Offline setup incomplete"}
        {offline ? " · You are offline" : ""}.
        {collection
          ? ` Last successful sync: ${new Date(collection.syncedAt).toLocaleString()}.`
          : " No complete saved collection."}
      </p>
      {offer && difference ? (
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
          <button type="button" onClick={() => void sync()} disabled={busy}>
            Sync now
          </button>{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              dismissed.add(offer.revision);
              setOffer(null);
              setMessage("Saved recipes kept. Use Sync to check again.");
            }}
          >
            Later
          </button>
        </div>
      ) : null}
      <button type="button" disabled={busy || offline} onClick={() => void check(true)}>
        Sync
      </button>{" "}
      <button type="button" disabled={busy} onClick={() => setRemoveConfirm(true)}>
        Remove offline downloads
      </button>
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
      {message ? <p role="status">{message}</p> : null}
      {error ? (
        <p role="alert">
          {error}{" "}
          <button type="button" disabled={busy || offline} onClick={() => void check(true)}>
            Retry
          </button>
        </p>
      ) : null}
      {updateReady ? (
        <p role="status">
          An app update is ready. Close all Common Table pages, then reopen to use it. Your open
          recipes and unsaved edits stay as they are.
        </p>
      ) : null}
      <p className={styles.note}>
        Safari may remove website storage. Downloads are not a permanent backup. If the entire
        offline app is removed, reconnect to download it again. Editing needs an internet
        connection.
      </p>
    </section>
  );
}
