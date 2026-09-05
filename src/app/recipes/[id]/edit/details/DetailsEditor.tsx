"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";

import { GuardedLink } from "@/components/navigation/GuardedLink";
import { useUnsavedChangesWarning } from "@/components/navigation/UnsavedChangesProvider";
import { ownedRecipeDetailsSchema, type OwnedRecipeDetails } from "@/utils/recipe-details";
import { recipeDraftSchema, type RecipeDraftRequest } from "@/utils/recipe-draft";

import formStyles from "../../../new/start-recipe.module.scss";
import { RecipeEditNavigation } from "../RecipeEditNavigation";
import styles from "./details.module.scss";

const fields = ["title", "description", "yieldMin", "yieldMax", "yieldUnit"] as const;
const fieldId = (field: keyof RecipeDraftRequest) => `details-${field}`;

function formValues(recipe: OwnedRecipeDetails): RecipeDraftRequest {
  return {
    title: recipe.title,
    description: recipe.description ?? "",
    yieldMin: recipe.yieldMin?.toString() ?? "",
    yieldMax: recipe.yieldMax?.toString() ?? "",
    yieldUnit: recipe.yieldUnit,
  };
}

export function DetailsEditor({ recipe }: { recipe: OwnedRecipeDetails }) {
  const router = useRouter();
  const [saved, setSaved] = useState(recipe);
  const [rangeEnabled, setRangeEnabled] = useState(recipe.yieldMax !== null);
  const [message, setMessage] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [conflicted, setConflicted] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const requestLock = useRef(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty, isSubmitting, submitCount },
  } = useForm<RecipeDraftRequest>({
    defaultValues: formValues(recipe),
    resolver: zodResolver(recipeDraftSchema),
  });
  useUnsavedChangesWarning(isDirty);
  const busy = isSubmitting || reloading;
  const validationErrors = fields.flatMap((field) => {
    const error = errors[field]?.message;
    return error ? [{ field, message: error }] : [];
  });

  useEffect(() => {
    if (message) bannerRef.current?.focus();
  }, [message]);

  useEffect(() => {
    if (submitCount > 0 && validationErrors.length > 0) summaryRef.current?.focus();
  }, [submitCount, validationErrors.length]);

  function acceptSaved(latest: OwnedRecipeDetails) {
    if (latest.id !== saved.id) throw new Error("Unexpected draft response.");
    setSaved(latest);
    // Only a successful explicit save or reload replaces input and its dirty baseline.
    reset(formValues(latest));
    setRangeEnabled(latest.yieldMax !== null);
    setConflicted(false);
    setMessage(null);
    setSessionExpired(false);
    router.refresh();
  }

  function reportFailure(status: number) {
    setSessionExpired(status === 401);
    if (status === 409) {
      setConflicted(true);
      setMessage(
        "This draft changed in another tab. Your work is still here. Reload the latest draft before saving again.",
      );
    } else if (status === 401) {
      setMessage("Your session expired. Your work is still here. Sign in again, then retry.");
    } else if (status === 404) {
      setMessage("This draft is unavailable. Your entered values are still here.");
    } else if (status === 400) {
      setMessage(
        "We couldn’t save these details. Check the fields and try again. Your work is still here.",
      );
    } else {
      setMessage("We couldn’t complete the request. Your work is still here. Try again.");
    }
  }

  async function save(values: RecipeDraftRequest) {
    setSavedNotice(false);
    setMessage(null);
    try {
      const response = await fetch(`/api/recipes/${saved.id}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, expectedVersion: saved.version }),
      });
      // Read status first: even a malformed conflict response must lock further saves.
      if (!response.ok) {
        reportFailure(response.status);
        return;
      }
      const payload = (await response.json()) as { recipe: OwnedRecipeDetails };
      acceptSaved(ownedRecipeDetailsSchema.parse(payload.recipe));
      setSavedNotice(true);
    } catch {
      reportFailure(0);
    }
  }

  const submit = handleSubmit(save);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (requestLock.current || busy || conflicted) {
      event.preventDefault();
      return;
    }
    requestLock.current = true;
    void submit(event).finally(() => {
      requestLock.current = false;
    });
  }

  async function reloadLatest() {
    if (
      requestLock.current ||
      !window.confirm("Reload the latest draft? This discards your unsaved input.")
    )
      return;
    requestLock.current = true;
    setReloading(true);
    setSavedNotice(false);
    try {
      const response = await fetch(`/api/recipes/${saved.id}/details`, { cache: "no-store" });
      if (!response.ok) {
        reportFailure(response.status);
        return;
      }
      const payload = (await response.json()) as { recipe: OwnedRecipeDetails };
      acceptSaved(ownedRecipeDetailsSchema.parse(payload.recipe));
    } catch {
      reportFailure(0);
    } finally {
      requestLock.current = false;
      setReloading(false);
    }
  }

  function renderField(field: keyof RecipeDraftRequest, label: string) {
    const error = errors[field]?.message;
    const attributes = {
      id: fieldId(field),
      "aria-invalid": Boolean(error),
      "aria-describedby": error ? `${fieldId(field)}-error` : undefined,
      ...register(field),
    };
    return (
      <div className={formStyles.field}>
        <label htmlFor={fieldId(field)}>{label}</label>
        {field === "description" ? (
          <textarea {...attributes} maxLength={500} rows={3} />
        ) : (
          <input
            {...attributes}
            type="text"
            autoComplete="off"
            inputMode={field === "yieldMin" || field === "yieldMax" ? "decimal" : undefined}
            maxLength={field === "title" ? 120 : field === "yieldUnit" ? 40 : undefined}
            placeholder={field === "yieldUnit" ? "servings" : undefined}
          />
        )}
        {error ? (
          <p className={formStyles.error} id={`${fieldId(field)}-error`}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Recipe draft</p>
        <p className={styles.recipeTitle}>{saved.title}</p>
        <h1>Details</h1>
      </header>
      <RecipeEditNavigation currentStage="details" recipeId={saved.id} />
      {message ? (
        <div className={formStyles.serverBanner} ref={bannerRef} role="alert" tabIndex={-1}>
          <p>{message}</p>
          {sessionExpired ? (
            <GuardedLink href="/sign-in" target="_blank" rel="noopener noreferrer">
              Sign in in a new tab
            </GuardedLink>
          ) : null}
          {conflicted ? (
            <button type="button" disabled={busy} onClick={() => void reloadLatest()}>
              {reloading ? "Reloading…" : "Reload latest draft"}
            </button>
          ) : null}
        </div>
      ) : null}
      <form
        id="recipe-details-form"
        className={formStyles.form}
        onSubmit={onSubmit}
        noValidate
        aria-busy={busy}
      >
        {validationErrors.length > 0 ? (
          <div className={formStyles.errorSummary} role="alert" tabIndex={-1} ref={summaryRef}>
            <h2>Fix the following before saving:</h2>
            <ul>
              {validationErrors.map(({ field, message: error }) => (
                <li key={field}>
                  <a
                    href={`#${fieldId(field)}`}
                    onClick={(event) => {
                      event.preventDefault();
                      document.getElementById(fieldId(field))?.focus();
                    }}
                  >
                    {error}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <fieldset className={styles.fields} disabled={busy}>
          <legend className={styles.legend}>Draft details</legend>
          {renderField("title", "Recipe title")}
          {renderField("description", "Description (optional)")}
          <fieldset className={formStyles.yieldFieldset}>
            <legend>Yield (optional)</legend>
            <p className={formStyles.helper}>
              Leave blank if the recipe does not have a fixed yield. Changing yield does not change
              ingredient quantities.
            </p>
            <div
              className={`${formStyles.yieldGrid} ${rangeEnabled ? formStyles.yieldGridRange : formStyles.yieldGridSingle}`}
            >
              {renderField("yieldMin", rangeEnabled ? "Starting amount" : "Amount")}
              {rangeEnabled ? renderField("yieldMax", "Ending amount") : null}
              {renderField("yieldUnit", "Unit")}
            </div>
            <button
              className={formStyles.rangeButton}
              type="button"
              onClick={() => {
                if (rangeEnabled)
                  setValue("yieldMax", "", { shouldDirty: true, shouldValidate: true });
                setRangeEnabled(!rangeEnabled);
              }}
            >
              {rangeEnabled ? "Remove range" : "Add a range"}
            </button>
          </fieldset>
        </fieldset>
        <p role="status" className={formStyles.liveStatus}>
          {isSubmitting ? "Saving details…" : savedNotice && !isDirty ? "Details saved." : ""}
        </p>
        <button className={formStyles.submitButton} type="submit" disabled={busy || conflicted}>
          {isSubmitting ? "Saving…" : "Save details"}
        </button>
      </form>
    </>
  );
}
