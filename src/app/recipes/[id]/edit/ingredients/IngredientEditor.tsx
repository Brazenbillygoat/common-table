"use client";

import { type FormEvent, type MouseEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  type RecipeIngredientEditorData,
  type RecipeIngredientLine,
  type RecipeIngredientRequest,
  recipeIngredientRequestSchema,
} from "@/utils/recipe-ingredient";

import styles from "./ingredient-stage.module.scss";

type FormValues = Omit<RecipeIngredientRequest, "expectedVersion">;
type Banner = "none" | "auth" | "conflict" | "failure";

const emptyForm: FormValues = {
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

const fieldIds: Record<keyof FormValues, string> = {
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

export function IngredientEditor({ data }: { data: RecipeIngredientEditorData }) {
  const router = useRouter();
  const [lines, setLines] = useState(data.lines);
  const [version, setVersion] = useState(data.recipe.version);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<Banner>("none");
  const [status, setStatus] = useState("Draft saved");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const mutationLock = useRef(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const editButtons = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (editingId !== null) {
      queueMicrotask(() => {
        document
          .getElementById(
            form.ingredientSource === "canonical"
              ? fieldIds.ingredientId
              : fieldIds.customIngredient,
          )
          ?.focus();
      });
    }
  }, [editingId, form.ingredientSource]);

  useEffect(() => {
    if (banner !== "none") {
      bannerRef.current?.focus();
    }
  }, [banner]);

  function openNew() {
    setForm(emptyForm);
    setFieldErrors({});
    setBanner("none");
    setEditingId("new");
  }

  function openEdit(line: RecipeIngredientLine) {
    setForm(formFromLine(line));
    setFieldErrors({});
    setBanner("none");
    setDeletingId(null);
    setEditingId(line.id);
  }

  function cancelEdit() {
    const previousId = editingId;
    setEditingId(null);
    setFieldErrors({});
    setForm(emptyForm);
    if (previousId && previousId !== "new") {
      queueMicrotask(() => editButtons.current.get(previousId)?.focus());
    }
  }

  function updateField<Key extends keyof FormValues>(key: Key, value: FormValues[Key]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "quantityMode") {
        if (value === "none") {
          next.quantityMin = "";
          next.quantityMax = "";
          next.quantityText = "";
        } else if (value === "single") {
          next.quantityMax = "";
          next.quantityText = "";
        } else if (value === "range") {
          next.quantityText = "";
        } else if (value === "text") {
          next.quantityMin = "";
          next.quantityMax = "";
          next.unitSource = "none";
          next.unitId = "";
          next.customUnit = "";
        }
      }
      if (key === "ingredientSource") {
        if (value === "canonical") next.customIngredient = "";
        if (value === "custom") next.ingredientId = "";
      }
      if (key === "unitSource") {
        if (value !== "canonical") next.unitId = "";
        if (value !== "custom") next.customUnit = "";
      }
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutationLock.current || pending || banner === "conflict") return;
    const validation = recipeIngredientRequestSchema.safeParse({
      ...form,
      expectedVersion: version,
    });
    if (!validation.success) {
      setFieldErrors(validation.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    const isNew = editingId === "new";
    const endpoint = isNew
      ? `/api/recipes/${data.recipe.id}/ingredients`
      : `/api/recipes/${data.recipe.id}/ingredients/${editingId}`;
    const result = await mutate(endpoint, isNew ? "POST" : "PATCH", validation.data);
    if (!result) return;
    const line = result.line as RecipeIngredientLine;
    setVersion(result.version as number);
    setLines((current) =>
      isNew
        ? [...current, line]
        : current.map((existing) => (existing.id === line.id ? line : existing)),
    );
    setEditingId(null);
    setForm(emptyForm);
    setStatus("Ingredient saved.");
  }

  async function deleteLine(id: string) {
    const result = await mutate(`/api/recipes/${data.recipe.id}/ingredients/${id}`, "DELETE", {
      expectedVersion: version,
    });
    if (!result) return;
    setVersion(result.version as number);
    setLines((current) =>
      (result.ingredientIds as string[]).map((remainingId, position) => ({
        ...current.find((line) => line.id === remainingId)!,
        position,
      })),
    );
    setDeletingId(null);
    setStatus("Ingredient saved.");
  }

  async function move(index: number, direction: -1 | 1) {
    const reordered = [...lines];
    const target = index + direction;
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const result = await mutate(`/api/recipes/${data.recipe.id}/ingredients/order`, "PUT", {
      expectedVersion: version,
      ingredientIds: reordered.map((line) => line.id),
    });
    if (!result) return;
    setVersion(result.version as number);
    setLines(reordered.map((line, position) => ({ ...line, position })));
    setStatus("Ingredient saved.");
  }

  async function mutate(endpoint: string, method: string, body: unknown) {
    if (mutationLock.current) return null;
    mutationLock.current = true;
    setPending(true);
    setStatus("Saving ingredient…");
    setBanner("none");
    setFieldErrors({});
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        data?: Record<string, unknown>;
        error?: { code?: string; fieldErrors?: Record<string, string[]> };
      };
      if (response.ok && payload.data) return payload.data;
      if (response.status === 400 && payload.error?.fieldErrors && editingId !== null) {
        setFieldErrors(payload.error.fieldErrors);
      } else if (response.status === 401) {
        setBanner("auth");
      } else if (response.status === 409) {
        setBanner("conflict");
      } else {
        setBanner("failure");
      }
      setStatus("Changes not saved.");
      return null;
    } catch {
      setBanner("failure");
      setStatus("Changes not saved.");
      return null;
    } finally {
      setPending(false);
      mutationLock.current = false;
    }
  }

  const validationEntries = Object.entries(fieldErrors).flatMap(([field, messages]) =>
    messages.map((message) => ({ field: field as keyof FormValues, message })),
  );

  return (
    <section aria-busy={pending}>
      <p aria-live="polite" className={styles.status}>
        {status}
      </p>
      {banner !== "none" ? (
        <div className={styles.banner} ref={bannerRef} role="alert" tabIndex={-1}>
          <h2>
            {banner === "auth"
              ? "Your session expired. Sign in again to continue."
              : banner === "conflict"
                ? "This draft changed elsewhere."
                : "We couldn’t save that ingredient change."}
          </h2>
          {banner === "conflict" ? (
            <>
              <p>Reload the latest version before making another change.</p>
              <button onClick={() => router.refresh()} type="button">
                Reload draft
              </button>
            </>
          ) : null}
          {banner === "failure" ? <p>Your work is still here. Try again.</p> : null}
        </div>
      ) : null}

      {lines.length === 0 && editingId === null ? (
        <div className={styles.emptyState}>
          <h2>No ingredients yet</h2>
          <p>Add the first ingredient for this recipe.</p>
        </div>
      ) : null}

      {lines.length > 0 ? (
        <ul className={styles.lineList}>
          {lines.map((line, index) => (
            <li className={styles.line} key={line.id}>
              <p className={styles.lineText}>{formatLine(line)}</p>
              {editingId === line.id ? (
                <IngredientForm
                  data={data}
                  fieldErrors={fieldErrors}
                  form={form}
                  pending={pending}
                  submit={submit}
                  updateField={updateField}
                  validationEntries={validationEntries}
                  cancel={cancelEdit}
                  submitLabel="Save changes"
                />
              ) : (
                <>
                  <div className={styles.lineActions}>
                    <button
                      disabled={pending || banner === "conflict"}
                      onClick={() => openEdit(line)}
                      ref={(element) => {
                        if (element) editButtons.current.set(line.id, element);
                      }}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      disabled={pending || banner === "conflict"}
                      onClick={() => setDeletingId(line.id)}
                      type="button"
                    >
                      Delete
                    </button>
                    <button
                      disabled={index === 0 || pending || banner === "conflict"}
                      onClick={() => void move(index, -1)}
                      type="button"
                    >
                      Move up
                    </button>
                    <button
                      disabled={index === lines.length - 1 || pending || banner === "conflict"}
                      onClick={() => void move(index, 1)}
                      type="button"
                    >
                      Move down
                    </button>
                  </div>
                  {deletingId === line.id ? (
                    <div className={styles.deleteConfirmation}>
                      <p>Delete ingredient?</p>
                      <button
                        disabled={pending}
                        onClick={() => void deleteLine(line.id)}
                        type="button"
                      >
                        Delete
                      </button>
                      <button onClick={() => setDeletingId(null)} type="button">
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {editingId === "new" ? (
        <IngredientForm
          data={data}
          fieldErrors={fieldErrors}
          form={form}
          pending={pending}
          submit={submit}
          updateField={updateField}
          validationEntries={validationEntries}
          cancel={cancelEdit}
          submitLabel="Add ingredient"
        />
      ) : null}
      {editingId === null ? (
        <button
          className={styles.addButton}
          disabled={pending || banner === "conflict"}
          onClick={openNew}
          type="button"
        >
          Add ingredient
        </button>
      ) : null}
    </section>
  );
}

interface IngredientFormProps {
  data: RecipeIngredientEditorData;
  form: FormValues;
  fieldErrors: Record<string, string[]>;
  validationEntries: { field: keyof FormValues; message: string }[];
  pending: boolean;
  submitLabel: string;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  cancel: () => void;
  updateField: <Key extends keyof FormValues>(key: Key, value: FormValues[Key]) => void;
}

function IngredientForm(props: IngredientFormProps) {
  const { form, fieldErrors, updateField } = props;
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (props.validationEntries.length > 0) {
      summaryRef.current?.focus();
    }
  }, [props.validationEntries.length]);
  function error(field: keyof FormValues) {
    return fieldErrors[field]?.[0];
  }
  function focusField(event: MouseEvent<HTMLAnchorElement>, field: keyof FormValues) {
    event.preventDefault();
    document.getElementById(fieldIds[field])?.focus();
  }
  return (
    <form className={styles.form} noValidate onSubmit={props.submit}>
      {props.validationEntries.length > 0 ? (
        <div className={styles.errorSummary} ref={summaryRef} role="alert" tabIndex={-1}>
          <h2>Fix the following ingredient fields:</h2>
          <ul>
            {props.validationEntries.map(({ field, message }) => (
              <li key={`${field}-${message}`}>
                <a href={`#${fieldIds[field]}`} onClick={(event) => focusField(event, field)}>
                  {message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <fieldset>
        <legend>Ingredient</legend>
        <label htmlFor={fieldIds.ingredientSource}>Ingredient type</label>
        <select
          id={fieldIds.ingredientSource}
          onChange={(event) =>
            updateField("ingredientSource", event.target.value as FormValues["ingredientSource"])
          }
          value={form.ingredientSource}
        >
          <option value="canonical">Ingredient list</option>
          <option value="custom">Other</option>
        </select>
        {form.ingredientSource === "canonical" ? (
          <>
            <label htmlFor={fieldIds.ingredientId}>Ingredient</label>
            <select
              aria-describedby={error("ingredientId") ? "ingredient-id-error" : undefined}
              aria-invalid={Boolean(error("ingredientId"))}
              id={fieldIds.ingredientId}
              onChange={(event) => updateField("ingredientId", event.target.value)}
              value={form.ingredientId}
            >
              <option value="">Choose an ingredient</option>
              {props.data.ingredientOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <FieldError id="ingredient-id-error" message={error("ingredientId")} />
          </>
        ) : (
          <>
            <label htmlFor={fieldIds.customIngredient}>Other ingredient</label>
            <input
              aria-describedby={error("customIngredient") ? "custom-ingredient-error" : undefined}
              aria-invalid={Boolean(error("customIngredient"))}
              id={fieldIds.customIngredient}
              maxLength={120}
              onChange={(event) => updateField("customIngredient", event.target.value)}
              value={form.customIngredient}
            />
            <FieldError id="custom-ingredient-error" message={error("customIngredient")} />
          </>
        )}
      </fieldset>
      <fieldset>
        <legend>Quantity</legend>
        <label htmlFor={fieldIds.quantityMode}>Quantity type</label>
        <select
          id={fieldIds.quantityMode}
          onChange={(event) =>
            updateField("quantityMode", event.target.value as FormValues["quantityMode"])
          }
          value={form.quantityMode}
        >
          <option value="none">None</option>
          <option value="single">Amount</option>
          <option value="range">Range</option>
          <option value="text">Text</option>
        </select>
        {form.quantityMode === "single" || form.quantityMode === "range" ? (
          <>
            <label htmlFor={fieldIds.quantityMin}>
              {form.quantityMode === "range" ? "Starting amount" : "Amount"}
            </label>
            <input
              aria-describedby={error("quantityMin") ? "quantity-min-error" : undefined}
              aria-invalid={Boolean(error("quantityMin"))}
              id={fieldIds.quantityMin}
              inputMode="decimal"
              onChange={(event) => updateField("quantityMin", event.target.value)}
              type="text"
              value={form.quantityMin}
            />
            <FieldError id="quantity-min-error" message={error("quantityMin")} />
          </>
        ) : null}
        {form.quantityMode === "range" ? (
          <>
            <label htmlFor={fieldIds.quantityMax}>Ending amount</label>
            <input
              aria-describedby={error("quantityMax") ? "quantity-max-error" : undefined}
              aria-invalid={Boolean(error("quantityMax"))}
              id={fieldIds.quantityMax}
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
            <label htmlFor={fieldIds.quantityText}>Quantity text</label>
            <input
              aria-describedby={error("quantityText") ? "quantity-text-error" : undefined}
              aria-invalid={Boolean(error("quantityText"))}
              id={fieldIds.quantityText}
              maxLength={40}
              onChange={(event) => updateField("quantityText", event.target.value)}
              value={form.quantityText}
            />
            <FieldError id="quantity-text-error" message={error("quantityText")} />
          </>
        ) : null}
      </fieldset>
      {form.quantityMode !== "text" ? (
        <fieldset>
          <legend>Unit</legend>
          <label htmlFor={fieldIds.unitSource}>Unit type</label>
          <select
            id={fieldIds.unitSource}
            onChange={(event) =>
              updateField("unitSource", event.target.value as FormValues["unitSource"])
            }
            value={form.unitSource}
          >
            <option value="none">None</option>
            <option value="canonical">Unit list</option>
            <option value="custom">Other</option>
          </select>
          {form.unitSource === "canonical" ? (
            <>
              <label htmlFor={fieldIds.unitId}>Unit</label>
              <select
                aria-describedby={error("unitId") ? "unit-id-error" : undefined}
                aria-invalid={Boolean(error("unitId"))}
                id={fieldIds.unitId}
                onChange={(event) => updateField("unitId", event.target.value)}
                value={form.unitId}
              >
                <option value="">Choose a unit</option>
                {props.data.unitOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              <FieldError id="unit-id-error" message={error("unitId")} />
            </>
          ) : null}
          {form.unitSource === "custom" ? (
            <>
              <label htmlFor={fieldIds.customUnit}>Other unit</label>
              <input
                aria-describedby={error("customUnit") ? "custom-unit-error" : undefined}
                aria-invalid={Boolean(error("customUnit"))}
                id={fieldIds.customUnit}
                maxLength={40}
                onChange={(event) => updateField("customUnit", event.target.value)}
                value={form.customUnit}
              />
              <FieldError id="custom-unit-error" message={error("customUnit")} />
            </>
          ) : null}
        </fieldset>
      ) : null}
      <label htmlFor={fieldIds.preparationNote}>Preparation note (optional)</label>
      <input
        aria-describedby={error("preparationNote") ? "preparation-note-error" : undefined}
        aria-invalid={Boolean(error("preparationNote"))}
        id={fieldIds.preparationNote}
        maxLength={200}
        onChange={(event) => updateField("preparationNote", event.target.value)}
        value={form.preparationNote}
      />
      <FieldError id="preparation-note-error" message={error("preparationNote")} />
      <label className={styles.checkbox} htmlFor={fieldIds.isOptional}>
        <input
          checked={form.isOptional}
          id={fieldIds.isOptional}
          onChange={(event) => updateField("isOptional", event.target.checked)}
          type="checkbox"
        />
        Optional ingredient
      </label>
      <div className={styles.formActions}>
        <button disabled={props.pending} type="submit">
          {props.submitLabel}
        </button>
        <button disabled={props.pending} onClick={props.cancel} type="button">
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

function formFromLine(line: RecipeIngredientLine): FormValues {
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

function formatLine(line: RecipeIngredientLine) {
  const quantity = line.quantityText
    ? line.quantityText
    : line.quantityMin !== null
      ? line.quantityMax !== null
        ? `${line.quantityMin}–${line.quantityMax}`
        : `${line.quantityMin}`
      : "";
  return [
    quantity,
    line.unitName,
    line.ingredientName,
    line.preparationNote ? `, ${line.preparationNote}` : "",
    line.isOptional ? " (optional)" : "",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(" ,", ",");
}
