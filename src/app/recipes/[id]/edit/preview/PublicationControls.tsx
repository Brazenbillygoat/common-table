"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import type { publicationReadiness } from "@/utils/recipe-publication";

import styles from "./publication-controls.module.scss";

const publicationSchema = z.object({
  version: z.number().int().positive(),
  status: z.enum(["draft", "published"]),
  sourceVersion: z.number().int().positive().nullable(),
  publishedAt: z.string().nullable(),
  slug: z.string().min(1),
});

type Publication = z.infer<typeof publicationSchema>;

export function PublicationControls({
  recipeId,
  publication,
  requirements,
  stale = false,
}: {
  recipeId: string;
  publication: Publication;
  requirements: ReturnType<typeof publicationReadiness>;
  stale?: boolean;
}) {
  const [saved, setSaved] = useState(publication);
  const [busy, setBusy] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(stale);
  const [message, setMessage] = useState<string | null>(
    stale ? "This recipe changed while loading. Reload the saved recipe before publishing." : null,
  );
  const [sessionExpired, setSessionExpired] = useState(false);
  const [notice, setNotice] = useState("");
  const requestLock = useRef(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const published = saved.status === "published";
  const unpublishedChanges = published && saved.version !== saved.sourceVersion;
  const canPublish = requirements.length === 0 && (!published || unpublishedChanges);

  useEffect(() => {
    if (message) alertRef.current?.focus();
  }, [message]);

  async function changePublication(action: "publish" | "unpublish") {
    if (requestLock.current || reloadRequired || (action === "publish" && !canPublish)) return;
    if (
      action === "unpublish" &&
      !window.confirm(
        "Unpublish this recipe? It will leave Browse and new visitors cannot open it. People already cooking can keep using their open page. Your saved recipe will stay here.",
      )
    )
      return;
    requestLock.current = true;
    setBusy(true);
    setMessage(null);
    setNotice("");
    setSessionExpired(false);
    try {
      const response = await fetch(`/api/recipes/${recipeId}/publication`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, expectedVersion: saved.version }),
      });
      // Read the status before the body so malformed conflict responses still block retries.
      if (!response.ok) {
        if (response.status === 409) {
          setReloadRequired(true);
          setMessage("This recipe changed elsewhere. Reload the saved recipe before continuing.");
        } else if (response.status === 401) {
          setSessionExpired(true);
          setMessage("Your session expired. Sign in again, then retry.");
        } else if (response.status === 404) {
          setReloadRequired(true);
          setMessage("This recipe is no longer available. Reload to check its current state.");
        } else if (response.status === 400 || response.status === 422) {
          setReloadRequired(true);
          setMessage("The saved recipe could not be published. Reload to check its requirements.");
        } else {
          throw new Error("Publication request failed.");
        }
        return;
      }
      const payload = (await response.json()) as { publication: unknown };
      const latest = publicationSchema.parse(payload.publication);
      if (
        latest.version !== saved.version + 1 ||
        latest.slug !== saved.slug ||
        latest.status !== (action === "publish" ? "published" : "draft") ||
        (action === "publish" && latest.sourceVersion !== latest.version)
      )
        throw new Error("Unexpected publication response.");
      setSaved(latest);
      setNotice(
        action === "publish"
          ? "Your saved recipe is now public."
          : "Recipe unpublished. Your saved content is still here.",
      );
    } catch {
      // A lost response may follow a committed transaction. Require a fresh view before retrying.
      setReloadRequired(true);
      setMessage(
        "We couldn't confirm the change. Reload the saved recipe to check its publication state.",
      );
    } finally {
      requestLock.current = false;
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="publication-heading" aria-busy={busy}>
      <h2 id="publication-heading">Publication</h2>
      <p className={styles.state}>
        {published
          ? unpublishedChanges
            ? "Published · Unpublished changes"
            : "Published · Up to date"
          : "Draft · Private"}
      </p>
      <p>Publishing shares saved content. Save any changes in the editors before publishing.</p>
      {published ? <p>Private edits stay private until you publish updates.</p> : null}
      {requirements.length > 0 ? (
        <div>
          <p>Before publishing:</p>
          <ul>
            {requirements.map(({ stage, message: requirement }) => (
              <li key={stage}>
                <Link href={`/recipes/${recipeId}/edit/${stage}`}>{requirement}</Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {message ? (
        <div className={styles.alert} role="alert" tabIndex={-1} ref={alertRef}>
          <p>{message}</p>
          {reloadRequired ? (
            <a href={`/recipes/${recipeId}/edit/preview`}>Reload saved recipe</a>
          ) : null}
          {sessionExpired ? (
            <Link href="/sign-in" target="_blank" rel="noopener noreferrer">
              Sign in in a new tab
            </Link>
          ) : null}
        </div>
      ) : null}
      <p role="status">{busy ? "Updating publication…" : notice}</p>
      <div className={styles.actions}>
        <button
          className={styles.primaryAction}
          type="button"
          disabled={busy || reloadRequired || !canPublish}
          onClick={() => void changePublication("publish")}
        >
          {published ? "Publish updates" : "Publish"}
        </button>
        {published ? (
          <>
            <a href={`/r/${encodeURIComponent(saved.slug)}`}>View public recipe</a>
            <button
              type="button"
              disabled={busy || reloadRequired}
              onClick={() => void changePublication("unpublish")}
            >
              Unpublish
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}
