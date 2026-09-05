"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  resolveRecipeAlternatives,
  type RecipeAlternativeContent,
  type RecipeBranchState,
} from "@/utils/recipe-alternatives";
import { formatRecipeIngredientLine } from "@/utils/recipe-ingredient";

import styles from "./recipe-preview.module.scss";

export function RecipePreview({ content }: { content: RecipeAlternativeContent }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hideUnused, setHideUnused] = useState(false);
  const choiceOptionIds = searchParams.getAll("choice");
  const optionalIngredientIds = searchParams.getAll("optional");
  const resolved = resolveRecipeAlternatives(content, {
    choiceOptionIds,
    optionalIngredientIds,
  });
  const lineById = new Map(resolved.ingredients.map((line) => [line.id, line]));
  // Filter only the content lists. Choices stay available, and unresolved branches
  // remain visible until a selection determines whether they apply.
  const visibleIngredients = resolved.ingredients.filter(
    (line) => !hideUnused || line.state !== "inactive",
  );
  const visibleSteps = resolved.steps.filter((step) => !hideUnused || step.state !== "inactive");

  function navigate(choiceIds: string[], optionalIds: string[]) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("choice");
    next.delete("optional");
    for (const id of choiceIds) next.append("choice", id);
    for (const id of optionalIds) next.append("optional", id);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function choose(groupId: string, optionId: string | null) {
    const choices = Object.entries(resolved.selectedChoiceByGroup)
      .filter(([id]) => id !== groupId)
      .map(([, id]) => id);
    if (optionId) choices.push(optionId);
    navigate(choices, resolved.selectedOptionalIngredientIds);
  }

  function toggleOptional(id: string, selected: boolean) {
    const optionals = new Set(resolved.selectedOptionalIngredientIds);
    if (selected) optionals.add(id);
    else optionals.delete(id);
    navigate(Object.values(resolved.selectedChoiceByGroup), [...optionals]);
  }

  return (
    <div className={styles.preview}>
      <label className={styles.visibilityControl}>
        <input
          aria-controls="preview-ingredient-content preview-instruction-content"
          checked={hideUnused}
          onChange={(event) => setHideUnused(event.target.checked)}
          type="checkbox"
        />
        Hide unused ingredients and steps
      </label>
      {resolved.invalidSelectionIds.length > 0 ? (
        <div className={styles.notice} role="status">
          <p>Some URL choices were invalid or no longer belong to this recipe and were ignored.</p>
          <button
            className={styles.secondaryAction}
            onClick={() =>
              navigate(
                Object.values(resolved.selectedChoiceByGroup),
                resolved.selectedOptionalIngredientIds,
              )
            }
            type="button"
          >
            Remove invalid choices from URL
          </button>
        </div>
      ) : null}

      <section aria-labelledby="preview-choices">
        <h2 id="preview-choices">Choices</h2>
        {content.choiceGroups.length === 0 &&
        !content.ingredients.some((line) => line.isOptional && !line.choiceGroupId) ? (
          <p>This draft has no ingredient choices yet.</p>
        ) : null}
        {content.choiceGroups.map((group) => {
          const options = resolved.ingredients.filter((line) => line.choiceGroupId === group.id);
          return (
            <fieldset className={styles.choiceGroup} key={group.id}>
              <legend>{group.label}</legend>
              {options.map((option) => (
                <label className={styles.choiceControl} key={option.id}>
                  <input
                    checked={resolved.selectedChoiceByGroup[group.id] === option.id}
                    name={`choice-${group.id}`}
                    onChange={() => choose(group.id, option.id)}
                    type="radio"
                  />
                  {formatRecipeIngredientLine(option)}
                </label>
              ))}
              <button
                className={styles.secondaryAction}
                aria-label={`Clear ${group.label} choice`}
                disabled={!resolved.selectedChoiceByGroup[group.id]}
                onClick={() => choose(group.id, null)}
                type="button"
              >
                Clear choice
              </button>
            </fieldset>
          );
        })}
        {resolved.ingredients
          .filter((line) => line.isOptional && !line.choiceGroupId)
          .map((line) => (
            <label className={styles.choiceControl} key={line.id}>
              <input
                checked={resolved.selectedOptionalIngredientIds.includes(line.id)}
                onChange={(event) => toggleOptional(line.id, event.target.checked)}
                type="checkbox"
              />
              Include {formatRecipeIngredientLine(line).replace(/ \(optional\)$/, "")}
            </label>
          ))}
      </section>

      <section aria-labelledby="preview-ingredients" id="preview-ingredient-content">
        <h2 id="preview-ingredients">Ingredients</h2>
        {resolved.ingredients.length > 0 && visibleIngredients.length === 0 ? (
          <p>No ingredients apply to the current selections.</p>
        ) : null}
        {content.sections.map((section) => {
          const sectionLines = visibleIngredients.filter((line) => line.sectionId === section.id);
          if (hideUnused && sectionLines.length === 0) return null;
          return (
            <section className={styles.ingredientSection} key={section.id}>
              {section.name ? <h3>{section.name}</h3> : null}
              <ul className={styles.ingredientList}>
                {sectionLines.map((line) => (
                  <li className={stateClass(line.state)} key={line.id}>
                    <span>{formatRecipeIngredientLine(line)}</span>
                    {line.choiceGroupId || line.isOptional ? (
                      <BranchLabel state={line.state} />
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </section>

      <section aria-labelledby="preview-instructions" id="preview-instruction-content">
        <h2 id="preview-instructions">Instructions</h2>
        {resolved.steps.length === 0 ? <p>No instructions yet.</p> : null}
        {resolved.steps.length > 0 && visibleSteps.length === 0 ? (
          <p>No steps apply to the current selections.</p>
        ) : null}
        <ol className={styles.instructionList}>
          {visibleSteps.map((step) => (
            <li className={stateClass(step.state)} key={step.id}>
              <p className={styles.stepHeading}>
                {step.activeNumber ? `Step ${step.activeNumber}` : "Not in active steps"}
              </p>
              <p>{step.instruction}</p>
              {step.conditionKind ? (
                <p className={styles.condition}>
                  {step.state === "unresolved"
                    ? "Undecided"
                    : step.state === "active"
                      ? "Active"
                      : "Inactive"}
                  {`: ${step.conditionLabel ?? lineById.get(step.conditionIngredientId ?? "")?.ingredientName ?? "ingredient choice"}`}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function BranchLabel({ state }: { state: RecipeBranchState }) {
  return (
    <span className={styles.branchLabel}>
      {state === "active" ? "Selected" : state === "inactive" ? "Not selected" : "Undecided"}
    </span>
  );
}

function stateClass(state: RecipeBranchState) {
  return `${styles.branch} ${styles[state]}`;
}
