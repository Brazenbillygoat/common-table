"use client";
import { useEffect } from "react";
import { useUnsavedChanges } from "@/components/navigation/UnsavedChangesProvider";

export function isPublicPath(path: string) {
  return path === "/" || path === "/search" || path === "/offline" || /^\/r\/[^/]+\/?$/.test(path);
}
export function OfflineNavigation() {
  const { confirmDeparture } = useUnsavedChanges();
  useEffect(() => {
    function click(event: MouseEvent) {
      if (
        navigator.onLine ||
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
        link.getAttribute("href")?.startsWith("#")
      )
        return;
      const url = new URL(link.href);
      if (url.origin === location.origin && isPublicPath(url.pathname)) {
        event.preventDefault();
        event.stopPropagation();
        // A document navigation lets the worker serve the anonymous shell;
        // arbitrary Next.js flight responses are never synthesized or cached.
        if (confirmDeparture()) location.assign(url.href);
      }
    }
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, [confirmDeparture]);
  return null;
}
