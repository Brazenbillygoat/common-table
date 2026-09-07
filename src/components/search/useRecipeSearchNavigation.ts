"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { searchParametersHref, type SearchParameters } from "@/utils/recipe-search-query";

type SearchFields = { q: string; include: string; exclude: string; sort: string };
type TextField = Exclude<keyof SearchFields, "sort">;
const inputValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value.join(", ") : (value ?? "");

function fieldsFromParameters(parameters: SearchParameters): SearchFields {
  const q = inputValue(parameters.q);
  return {
    q,
    include: inputValue(parameters.include),
    exclude: inputValue(parameters.exclude),
    sort: inputValue(parameters.sort) || (q.trim() ? "relevance" : "newest"),
  };
}

function fieldsHref(fields: SearchFields) {
  return searchParametersHref({
    q: fields.q || undefined,
    include: fields.include || undefined,
    exclude: fields.exclude || undefined,
    sort: fields.sort === (fields.q.trim() ? "relevance" : "newest") ? undefined : fields.sort,
  });
}

export function useRecipeSearchNavigation(
  parameters: SearchParameters,
  navigate?: (href: string) => void,
) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const source = searchParametersHref(parameters);
  const [state, setState] = useState(() => ({
    parameters,
    source,
    fields: fieldsFromParameters(parameters),
    requests: [] as string[],
    externalNavigation: 0,
  }));

  // A server response may arrive while newer text is still being debounced.
  // Acknowledge our navigation without replacing that draft (or its caret).
  // Back/pagination instead restore the external URL's values. Keep the DOM
  // mounted in both cases; this guarded render adjustment avoids a stale frame.
  if (state.parameters !== parameters) {
    const acknowledged = state.requests.lastIndexOf(source);
    const external = acknowledged < 0 && state.source !== source;
    setState({
      ...state,
      parameters,
      source,
      fields: external ? fieldsFromParameters(parameters) : state.fields,
      requests: external
        ? []
        : acknowledged >= 0
          ? state.requests.slice(acknowledged + 1)
          : state.requests,
      externalNavigation: state.externalNavigation + Number(external),
    });
  }

  function cancelDebounce() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }

  useEffect(() => {
    cancelDebounce();
  }, [state.externalNavigation]);

  useEffect(() => {
    function restoreUrl(url: URL) {
      cancelDebounce();
      composing.current = false;
      const restored: SearchParameters = {};
      for (const key of new Set(url.searchParams.keys())) {
        const values = url.searchParams.getAll(key);
        restored[key] = values.length === 1 ? values[0] : values;
      }
      setState((current) => ({
        ...current,
        source: searchParametersHref(restored),
        fields: fieldsFromParameters(restored),
        requests: [],
      }));
    }
    function restoreHistory() {
      restoreUrl(new URL(window.location.href));
    }
    function leavingByLink(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const link =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (
        link &&
        link.target !== "_blank" &&
        !link.hasAttribute("download") &&
        !link.getAttribute("href")?.startsWith("#")
      ) {
        cancelDebounce();
        const target = new URL(link.href);
        if (
          target.origin === window.location.origin &&
          ["/", "/search"].includes(target.pathname)
        ) {
          // An explicit Browse link can target the already committed URL while
          // an unsent draft differs. Treat it as navigation even in that case.
          restoreUrl(target);
        }
      }
    }
    // Cancel before a slow Back or link navigation can be overtaken by a timer.
    window.addEventListener("popstate", restoreHistory);
    document.addEventListener("click", leavingByLink, true);
    return () => {
      cancelDebounce();
      window.removeEventListener("popstate", restoreHistory);
      document.removeEventListener("click", leavingByLink, true);
    };
  }, []);

  function apply(fields: SearchFields) {
    cancelDebounce();
    const href = fieldsHref(fields);
    setState((current) => ({ ...current, fields, requests: [...current.requests, href] }));
    // A real App Router navigation reads fresh server results and gives each
    // applied search a Back entry. Next discards superseded navigation payloads.
    // Same-URL navigation refreshes this dynamic page too and, unlike refresh(),
    // supersedes any pending navigation, including a slow Back or Browse request.
    startTransition(() => {
      if (navigate) navigate(href);
      else if (!navigator.onLine) window.location.assign(href);
      else router.push(href, { scroll: false });
    });
  }

  function changeText(field: TextField, value: string) {
    const fields = { ...state.fields, [field]: value };
    setState((current) => ({ ...current, fields }));
    cancelDebounce();
    if (composing.current) return;
    if (!value) apply(fields);
    else timer.current = setTimeout(() => apply(fields), 500);
  }

  return {
    fields: state.fields,
    isPending,
    changeText,
    changeSort: (sort: string) => apply({ ...state.fields, sort }),
    removeTerm: (field: "include" | "exclude", index: number) =>
      apply({
        ...state.fields,
        [field]: state.fields[field]
          .split(",")
          .filter((_, item) => item !== index)
          .join(","),
      }),
    clear: () => apply(fieldsFromParameters({})),
    submit: () => {
      if (!composing.current) apply(state.fields);
    },
    compositionStart: () => {
      composing.current = true;
      cancelDebounce();
    },
    compositionEnd: (field: TextField, value: string) => {
      composing.current = false;
      changeText(field, value);
    },
    isComposing: () => composing.current,
  };
}
