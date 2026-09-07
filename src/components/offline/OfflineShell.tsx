"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- The offline shell uses local History API navigation; explicit online links require a document request. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { readCollection } from "@/offline/storage";
import { STORAGE_EVENT } from "@/offline/client";
import type { OfflineCollection, SavedRecipe } from "@/utils/offline-protocol";
import { searchPublications } from "@/utils/search-publications";
import type { SearchParameters } from "@/utils/recipe-search-query";
import { RecipeCookingView } from "@/components/recipes/RecipeCookingContent";
import { BrowseContent } from "@/components/search/BrowseContent";
import { isPublicPath } from "./OfflineNavigation";
import recipeStyles from "@/app/r/[slug]/recipe.module.scss";

export function OfflineShell() {
  const [collection, setCollection] = useState<OfflineCollection | null>(null);
  const [url, setUrl] = useState<URL | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(false);
  const readUrl = useCallback(() => setUrl(new URL(window.location.href)), []);
  const navigate = useCallback(
    (href: string) => {
      window.history.pushState(null, "", href);
      readUrl();
    },
    [readUrl],
  );
  useEffect(() => {
    async function load() {
      try {
        setCollection(await readCollection());
        setError("");
      } catch {
        setCollection(null);
        setError(
          "Saved recipes are unavailable or incompatible. Reconnect to retry or remove the downloads and set up again.",
        );
      } finally {
        setLoading(false);
      }
    }
    function connection() {
      setOnline(navigator.onLine);
    }
    // Keep shell navigation local even if navigator.onLine misreports a captive
    // network. An explicit online link performs a real fresh server navigation.
    function click(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (
        !link ||
        link.target ||
        link.hasAttribute("download") ||
        link.hasAttribute("data-online") ||
        link.getAttribute("href")?.startsWith("#")
      )
        return;
      const target = new URL(link.href);
      if (target.origin !== location.origin) return;
      if (isPublicPath(target.pathname)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        navigate(target.pathname + target.search + target.hash);
      } else if (!navigator.onLine) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setError("Editing and sign-in need an internet connection.");
      }
    }
    void load().then(() => {
      readUrl();
      connection();
    });
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", readUrl);
    window.addEventListener(STORAGE_EVENT, load);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    const channel = "BroadcastChannel" in window ? new BroadcastChannel(STORAGE_EVENT) : null;
    if (channel) channel.onmessage = load;
    return () => {
      channel?.close();
      document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", readUrl);
      window.removeEventListener(STORAGE_EVENT, load);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, [navigate, readUrl]);
  const parameters = useMemo(() => {
    const result: SearchParameters = {};
    if (url)
      for (const key of new Set(url.searchParams.keys())) {
        const values = url.searchParams.getAll(key);
        result[key] = values.length === 1 ? values[0] : values;
      }
    return result;
  }, [url]);
  const slug = url?.pathname.match(/^\/r\/([^/]+)\/?$/)?.[1];
  const saved = collection?.recipes.find((item) => item.snapshot.recipe.slug === slug);
  // Recipe state belongs to the open page, not a later storage replacement.
  // The keyed child deliberately retains the initially loaded publication.
  return (
    <>
      <div className="page-shell">
        <p role="status">
          Showing saved recipes
          {collection ? ` from ${new Date(collection.syncedAt).toLocaleString()}` : ""}.
        </p>
        {online ? (
          <p>
            To browse current publications online,{" "}
            <a data-online href={slug ? `/r/${slug}${url?.search ?? ""}` : `/${url?.search ?? ""}`}>
              open the latest online page
            </a>
            . This leaves the saved view.
          </p>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
      </div>
      {loading || !url ? (
        <main className="page-shell" id="main-content">
          Opening saved recipes…
        </main>
      ) : slug ? (
        <SavedCooking key={slug} initial={saved} url={url} onNavigate={readUrl} />
      ) : !collection ? (
        <main className="page-shell" id="main-content">
          <h1>No saved collection</h1>
          <p>Reconnect and choose Download now to save all published recipes for offline use.</p>
        </main>
      ) : (
        <BrowseContent
          parameters={parameters}
          navigate={navigate}
          result={searchPublications(
            collection.recipes.map((item) => ({
              ...item,
              publishedAt: new Date(item.publishedAt),
            })),
            parameters,
          )}
        />
      )}
    </>
  );
}
function SavedCooking({
  initial,
  url,
  onNavigate,
}: {
  initial?: SavedRecipe;
  url: URL;
  onNavigate: () => void;
}) {
  const [loaded] = useState(initial);
  if (!loaded)
    return (
      <main className="page-shell" id="main-content">
        <h1>Recipe not saved</h1>
        <p>
          This recipe is not in your last successful download. Reconnect and sync to check for it.
        </p>
        <a href="/">Browse recipes</a>
      </main>
    );
  const { snapshot } = loaded;
  const { recipe } = snapshot;
  return (
    <main className={`${recipeStyles.page} page-shell`} id="main-content">
      <a className={recipeStyles.browseLink} href="/">
        Browse recipes
      </a>
      <header className={recipeStyles.header}>
        <h1>{recipe.title}</h1>
        <p className={recipeStyles.author}>By {snapshot.authorDisplayName}</p>
        {recipe.description ? (
          <p className={recipeStyles.description}>{recipe.description}</p>
        ) : null}
        {recipe.yieldMin !== null ? (
          <p className={recipeStyles.yield}>
            Yield: {recipe.yieldMin}
            {recipe.yieldMax !== null ? `–${recipe.yieldMax}` : ""} {recipe.yieldUnit}
          </p>
        ) : null}
      </header>
      <RecipeCookingView
        content={snapshot}
        pathname={url.pathname}
        searchParams={url.searchParams}
        onNavigate={onNavigate}
      />
    </main>
  );
}
