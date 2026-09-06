"use client";

import { useRef } from "react";
import { SEARCH_LIMITS, type SearchParameters } from "@/utils/recipe-search-query";
import styles from "./search.module.scss";
import { useRecipeSearchNavigation } from "./useRecipeSearchNavigation";

export function SearchControls({ parameters }: { parameters: SearchParameters }) {
  const search = useRecipeSearchNavigation(parameters);
  const includeInput = useRef<HTMLInputElement>(null);
  const excludeInput = useRef<HTMLInputElement>(null);
  return (
    <form
      action="/"
      method="get"
      role="search"
      className={styles.controls}
      aria-label="Recipe search"
      aria-describedby="ingredient-matching search-apply"
      onSubmit={(event) => {
        event.preventDefault();
        search.submit();
      }}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          (search.isComposing() || event.nativeEvent.isComposing || event.keyCode === 229)
        )
          event.preventDefault();
      }}
    >
      <label htmlFor="recipe-query">Search recipes</label>
      <input
        id="recipe-query"
        name="q"
        type="search"
        value={search.fields.q}
        onChange={(event) => search.changeText("q", event.target.value)}
        onCompositionStart={search.compositionStart}
        onCompositionEnd={(event) => search.compositionEnd("q", event.currentTarget.value)}
        maxLength={SEARCH_LIMITS.query}
        placeholder="Title, description, or ingredient"
      />
      <div className={styles.filters}>
        {(["include", "exclude"] as const).map((kind) => {
          const value = search.fields[kind];
          const input = kind === "include" ? includeInput : excludeInput;
          return (
            <div key={kind}>
              <label htmlFor={`recipe-${kind}`}>
                {kind === "include" ? "Include ingredients" : "Exclude ingredients"}
              </label>
              <input
                ref={input}
                id={`recipe-${kind}`}
                name={kind}
                value={value}
                onChange={(event) => search.changeText(kind, event.target.value)}
                onCompositionStart={search.compositionStart}
                onCompositionEnd={(event) => search.compositionEnd(kind, event.currentTarget.value)}
                maxLength={SEARCH_LIMITS.filterText}
                aria-describedby="filter-help ingredient-matching"
                placeholder={kind === "include" ? "chicken, tofu" : "butter"}
              />
              <ul
                className={styles.pills}
                aria-label={`${kind === "include" ? "Included" : "Excluded"} ingredient terms`}
              >
                {value.split(",").map((term, index) =>
                  term.trim() ? (
                    <li key={index}>
                      <button
                        type="button"
                        aria-label={`Remove ${kind} ${term.trim()}`}
                        onClick={() => {
                          search.removeTerm(kind, index);
                          input.current?.focus();
                        }}
                      >
                        {kind === "include" ? "+" : "−"} {term.trim()} ×
                      </button>
                    </li>
                  ) : null,
                )}
              </ul>
            </div>
          );
        })}
      </div>
      <p id="filter-help">
        Separate ingredient terms with commas. Up to 10 terms per field, 80 characters each.
      </p>
      <p id="ingredient-matching">
        Ingredient filters match text anywhere in ingredient names. &apos;Butter&apos; matches both
        &apos;salted butter&apos; and &apos;peanut butter,&apos; for inclusion and exclusion.
        Included ingredients may be alternatives. Review each recipe&apos;s ingredients and choices.
      </p>
      <div className={styles.actions}>
        <label htmlFor="recipe-sort">Sort by</label>
        <select
          id="recipe-sort"
          name="sort"
          value={search.fields.sort}
          onChange={(event) => search.changeSort(event.target.value)}
        >
          {search.fields.sort !== "relevance" && search.fields.sort !== "newest" ? (
            <option value={search.fields.sort}>Choose a valid sort</option>
          ) : null}
          <option value="relevance">Relevance</option>
          <option value="newest">Newest</option>
        </select>
        <button type="submit" className={styles.submit}>
          Search
        </button>
        <button type="button" className={styles.clear} onClick={search.clear}>
          Clear search and filters
        </button>
      </div>
      <p id="search-apply">Results update automatically. Press Enter or Search to update now.</p>
      {search.isPending ? <p role="status">Updating recipes…</p> : null}
    </form>
  );
}
