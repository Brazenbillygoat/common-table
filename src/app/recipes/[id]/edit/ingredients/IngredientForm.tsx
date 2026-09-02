"use client";

import { type FormEvent, type MouseEvent, useEffect, useRef } from "react";

import {
  type RecipeIngredientEditorData,
  type RecipeIngredientInput,
  type RecipeIngredientLine,
} from "@/utils/recipe-ingredient";

import { IngredientPicker } from "./IngredientPicker";
import styles from "./ingredient-stage.module.scss";

export type IngredientFormValues = RecipeIngredientInput;

export const emptyIngredientForm: IngredientFormValues = {
  ingredientSource: "canonical",
  ingredientId: "",
  customIngredient: "",
  quantityMode: "none",
  quantityMin: "",
  quantityMax: "",
  quantityText: "",
  unitSource: "none",
  unitId: "",
  customUnit: "",
  preparationNote: "",
  isOptional: false,
};

export const ingredientFieldIds: Record<keyof IngredientFormValues, string> = {
  ingredientSource: "ingredient-source",
  ingredientId: "ingredient-id",
  customIngredient: "custom-ingredient",
  quantityMode: "quantity-mode",
  quantityMin: "quantity-min",
  quantityMax: "quantity-max",
  quantityText: "quantity-text",
  unitSource: "unit-source",
  unitId: "unit-id",
  customUnit: "custom-unit",
  preparationNote: "preparation-note",
  isOptional: "ingredient-optional",
};

interface IngredientFormProps {
  data: RecipeIngredientEditorData;
  form: IngredientFormValues;
  ingredientQuery: string;
  fieldErrors: Record<string, string[]>;
  pending: boolean;
  submitLabel: string;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  cancel: () => void;
  setIngredientQuery: (query: string) => void;
  updateField: <Key extends keyof IngredientFormValues>(
    key: Key,
    value: IngredientFormValues[Key],
  ) => void;
  optionalDisabled?: boolean;
  mutationDisabled?: boolean;
}

export function IngredientForm(props: IngredientFormProps) {
  const { form, fieldErrors, updateField } = props;
  const validationEntries = Object.entries(fieldErrors).flatMap(([field, messages]) =>
    messages.map((message) => ({ field: field as keyof IngredientFormValues, message })),
  );
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (validationEntries.length > 0) summaryRef.current?.focus();
  }, [validationEntries.length]);
  function error(field: keyof IngredientFormValues) {
    return fieldErrors[field]?.[0];
  }
  function visibleFieldId(field: keyof IngredientFormValues) {
    return field === "unitId" ? ingredientFieldIds.unitSource : ingredientFieldIds[field];
  }
  function focusField(event: MouseEvent<HTMLAnchorElement>, field: keyof IngredientFormValues) {
    event.preventDefault();
    document.getElementById(visibleFieldId(field))?.focus();
  }
  function focusWhenVisible(field: keyof IngredientFormValues) {
    queueMicrotask(() => document.getElementById(visibleFieldId(field))?.focus());
  }
  function updateQuantityMinimum(value: string) {
    if (form.quantityMode === "single" && value === "") {
      updateField("quantityMode", "none");
      return;
    }
    if (form.quantityMode === "none" && value !== "") updateField("quantityMode", "single");
    updateField("quantityMin", value);
  }
  function chooseUnit(value: string) {
    if (value === "__none") updateField("unitSource", "none");
    else if (value === "__custom") {
      updateField("unitSource", "custom");
      focusWhenVisible("customUnit");
    } else {
      updateField("unitSource", "canonical");
      updateField("unitId", value);
    }
  }
  const selectedUnit =
    form.unitSource === "canonical"
      ? form.unitId
      : form.unitSource === "custom"
        ? "__custom"
        : "__none";
  return (
    <form className={styles.form} noValidate onSubmit={props.submit}>
      {validationEntries.length > 0 ? (
        <div className={styles.errorSummary} ref={summaryRef} role="alert" tabIndex={-1}>
          <h2>Fix the following ingredient fields:</h2>
          <ul>
            {validationEntries.map(({ field, message }) => (
              <li key={`${field}-${message}`}>
                <a href={`#${visibleFieldId(field)}`} onClick={(event) => focusField(event, field)}>
                  {message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <fieldset className={styles.formSection}>
        <legend>Ingredient</legend>
        {form.ingredientSource === "canonical" ? (
          <>
            <IngredientPicker
              errorId={error("ingredientId") ? "ingredient-id-error" : undefined}
              inputId={ingredientFieldIds.ingredientId}
              invalid={Boolean(error("ingredientId"))}
              onChooseCustom={() => {
                props.setIngredientQuery("");
                updateField("ingredientSource", "custom");
              }}
              onQueryChange={(query) => {
                props.setIngredientQuery(query);
                if (form.ingredientId) updateField("ingredientId", "");
              }}
              onSelect={(id) => updateField("ingredientId", id)}
              options={props.data.ingredientOptions}
              query={props.ingredientQuery}
              selectedId={form.ingredientId}
            />
            <FieldError id="ingredient-id-error" message={error("ingredientId")} />
          </>
        ) : (
          <>
            <label htmlFor={ingredientFieldIds.customIngredient}>Other ingredient</label>
            <input
              aria-describedby={error("customIngredient") ? "custom-ingredient-error" : undefined}
              aria-invalid={Boolean(error("customIngredient"))}
              id={ingredientFieldIds.customIngredient}
              maxLength={120}
              onChange={(event) => updateField("customIngredient", event.target.value)}
              value={form.customIngredient}
            />
            <FieldError id="custom-ingredient-error" message={error("customIngredient")} />
            <button
              className={styles.textAction}
              onClick={() => {
                updateField("ingredientSource", "canonical");
                props.setIngredientQuery("");
              }}
              type="button"
            >
              Choose from ingredient list
            </button>
          </>
        )}
      </fieldset>
      <fieldset className={styles.formSection}>
        <legend>
          Quantity <span className={styles.legendQualifier}>(optional)</span>
        </legend>
        {form.quantityMode !== "text" ? (
          <>
            <label htmlFor={ingredientFieldIds.quantityMin}>
              {form.quantityMode === "range" ? "Starting amount" : "Amount (optional)"}
            </label>
            <input
              aria-describedby={error("quantityMin") ? "quantity-min-error" : undefined}
              aria-invalid={Boolean(error("quantityMin"))}
              id={ingredientFieldIds.quantityMin}
              inputMode="decimal"
              onChange={(event) => updateQuantityMinimum(event.target.value)}
              type="text"
              value={form.quantityMin}
            />
            <FieldError id="quantity-min-error" message={error("quantityMin")} />
            <div className={styles.progressiveActions}>
              {form.quantityMode === "range" ? (
                <button
                  className={styles.textAction}
                  onClick={() => updateField("quantityMode", "single")}
                  type="button"
                >
                  Remove ending amount
                </button>
              ) : (
                <button
                  className={styles.textAction}
                  onClick={() => {
                    updateField("quantityMode", "range");
                    focusWhenVisible("quantityMax");
                  }}
                  type="button"
                >
                  Add an ending amount
                </button>
              )}
              <button
                className={styles.textAction}
                onClick={() => {
                  updateField("quantityMode", "text");
                  focusWhenVisible("quantityText");
                }}
                type="button"
              >
                Use a written quantity
              </button>
            </div>
          </>
        ) : null}
        {form.quantityMode === "range" ? (
          <>
            <label htmlFor={ingredientFieldIds.quantityMax}>Ending amount</label>
            <input
              aria-describedby={error("quantityMax") ? "quantity-max-error" : undefined}
              aria-invalid={Boolean(error("quantityMax"))}
              id={ingredientFieldIds.quantityMax}
              inputMode="decimal"
              onChange={(event) => updateField("quantityMax", event.target.value)}
              type="text"
              value={form.quantityMax}
            />
            <FieldError id="quantity-max-error" message={error("quantityMax")} />
          </>
        ) : null}
        {form.quantityMode === "text" ? (
          <>
            <label htmlFor={ingredientFieldIds.quantityText}>Quantity text</label>
            <input
              aria-describedby={error("quantityText") ? "quantity-text-error" : undefined}
              aria-invalid={Boolean(error("quantityText"))}
              id={ingredientFieldIds.quantityText}
              maxLength={40}
              onChange={(event) => updateField("quantityText", event.target.value)}
              value={form.quantityText}
            />
            <FieldError id="quantity-text-error" message={error("quantityText")} />
            <button
              className={styles.textAction}
              onClick={() => {
                updateField("quantityMode", "none");
                focusWhenVisible("quantityMin");
              }}
              type="button"
            >
              Use a numeric amount
            </button>
          </>
        ) : null}
        {form.quantityMode !== "text" ? (
          <>
            <label htmlFor={ingredientFieldIds.unitSource}>Unit (optional)</label>
            <select
              aria-describedby={error("unitId") ? "unit-id-error" : undefined}
              aria-invalid={Boolean(error("unitId"))}
              id={ingredientFieldIds.unitSource}
              onChange={(event) => chooseUnit(event.target.value)}
              value={selectedUnit}
            >
              <option value="__none">No unit</option>
              {props.data.unitOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
              <option value="__custom">Other unit...</option>
            </select>
            <FieldError id="unit-id-error" message={error("unitId")} />
            {form.unitSource === "custom" ? (
              <>
                <label htmlFor={ingredientFieldIds.customUnit}>Other unit</label>
                <input
                  aria-describedby={error("customUnit") ? "custom-unit-error" : undefined}
                  aria-invalid={Boolean(error("customUnit"))}
                  id={ingredientFieldIds.customUnit}
                  maxLength={40}
                  onChange={(event) => updateField("customUnit", event.target.value)}
                  value={form.customUnit}
                />
                <FieldError id="custom-unit-error" message={error("customUnit")} />
              </>
            ) : null}
          </>
        ) : null}
      </fieldset>
      <fieldset className={styles.formSection}>
        <legend>
          Details <span className={styles.legendQualifier}>(optional)</span>
        </legend>
        <label htmlFor={ingredientFieldIds.preparationNote}>Preparation note</label>
        <input
          aria-describedby={error("preparationNote") ? "preparation-note-error" : undefined}
          aria-invalid={Boolean(error("preparationNote"))}
          id={ingredientFieldIds.preparationNote}
          maxLength={200}
          onChange={(event) => updateField("preparationNote", event.target.value)}
          value={form.preparationNote}
        />
        <FieldError id="preparation-note-error" message={error("preparationNote")} />
        <label className={styles.checkbox} htmlFor={ingredientFieldIds.isOptional}>
          <input
            checked={form.isOptional}
            disabled={props.optionalDisabled}
            id={ingredientFieldIds.isOptional}
            onChange={(event) => updateField("isOptional", event.target.checked)}
            type="checkbox"
          />
          {props.optionalDisabled
            ? "Alternative options cannot be optional"
            : "This ingredient is optional"}
        </label>
      </fieldset>
      <div className={styles.formActions}>
        <button
          className={styles.primaryAction}
          disabled={props.pending || props.mutationDisabled}
          type="submit"
        >
          {props.submitLabel}
        </button>
        <button
          className={styles.secondaryAction}
          disabled={props.pending}
          onClick={props.cancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p className={styles.error} id={id}>
      {message}
    </p>
  ) : null;
}

export function ingredientFormFromLine(line: RecipeIngredientLine): IngredientFormValues {
  return {
    ingredientSource: line.ingredientId ? "canonical" : "custom",
    ingredientId: line.ingredientId ?? "",
    customIngredient: line.customIngredient ?? "",
    quantityMode: line.quantityText
      ? "text"
      : line.quantityMax !== null
        ? "range"
        : line.quantityMin !== null
          ? "single"
          : "none",
    quantityMin: line.quantityMin?.toString() ?? "",
    quantityMax: line.quantityMax?.toString() ?? "",
    quantityText: line.quantityText ?? "",
    unitSource: line.unitId ? "canonical" : line.customUnit ? "custom" : "none",
    unitId: line.unitId ?? "",
    customUnit: line.customUnit ?? "",
    preparationNote: line.preparationNote ?? "",
    isOptional: line.isOptional,
  };
}
