"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { SEARCH_LIMITS, type SearchParameters } from "@/utils/recipe-search-query";
import styles from "./search.module.scss";

const inputValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value.join(", ") : (value ?? "");

export function SearchControls({ parameters }: { parameters: SearchParameters }) {
  const [include, setInclude] = useState(inputValue(parameters.include));
  const [exclude, setExclude] = useState(inputValue(parameters.exclude));
  const includeInput = useRef<HTMLInputElement>(null);
  const excludeInput = useRef<HTMLInputElement>(null);
  const initialSort =
    inputValue(parameters.sort) || (inputValue(parameters.q).trim() ? "relevance" : "newest");
  return (
    <form
      action="/"
      method="get"
      role="search"
      className={styles.controls}
      aria-label="Recipe search"
      aria-describedby="ingredient-matching search-apply"
    >
      <label htmlFor="recipe-query">Search recipes</label>
      <input
        id="recipe-query"
        name="q"
        type="search"
        defaultValue={inputValue(parameters.q)}
        maxLength={SEARCH_LIMITS.query}
        placeholder="Title, description, or ingredient"
      />
      <div className={styles.filters}>
        {(["include", "exclude"] as const).map((kind) => {
          const value = kind === "include" ? include : exclude;
          const setValue = kind === "include" ? setInclude : setExclude;
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
                onChange={(event) => setValue(event.target.value)}
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
                          setValue(
                            value
                              .split(",")
                              .filter((_, item) => item !== index)
                              .join(","),
                          );
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
        <select id="recipe-sort" name="sort" defaultValue={initialSort}>
          {initialSort !== "relevance" && initialSort !== "newest" ? (
            <option value={initialSort}>Choose a valid sort</option>
          ) : null}
          <option value="relevance">Relevance</option>
          <option value="newest">Newest</option>
        </select>
        <button type="submit" className={styles.submit}>
          Search
        </button>
        <Link href="/" prefetch={false}>
          Clear search and filters
        </Link>
      </div>
      <p id="search-apply">Press Search to apply your terms, removed filters, and sorting.</p>
    </form>
  );
}
