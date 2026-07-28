"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import type { FormEvent, MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { recipeDraftSchema, type RecipeDraftRequest } from "@/utils/recipe-draft";

import styles from "./start-recipe.module.scss";

type ServerState =
  { kind: "none" } | { kind: "auth"; message: string } | { kind: "failure"; message: string };

const fieldOrder: (keyof RecipeDraftRequest)[] = [
  "title",
  "description",
  "yieldMin",
  "yieldMax",
  "yieldUnit",
];

const fieldIds: Record<keyof RecipeDraftRequest, string> = {
  title: "recipe-title",
  description: "recipe-description",
  yieldMin: "recipe-yield-min",
  yieldMax: "recipe-yield-max",
  yieldUnit: "recipe-yield-unit",
};

export function StartRecipeForm() {
  const router = useRouter();
  const [rangeEnabled, setRangeEnabled] = useState(false);
  const [unitFocused, setUnitFocused] = useState(false);
  const [serverState, setServerState] = useState<ServerState>({ kind: "none" });
  // Block a second submit before React has rendered the isSubmitting state.
  const submissionLock = useRef(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const serverBannerRef = useRef<HTMLDivElement>(null);
  const {
    formState: { errors, isSubmitting, submitCount },
    handleSubmit,
    register,
    setValue,
  } = useForm<RecipeDraftRequest>({
    defaultValues: {
      title: "",
      description: "",
      yieldMin: "",
      yieldMax: "",
      yieldUnit: "",
    },
    // The shared schema gives quick feedback here, but the API validates the request again.
    resolver: zodResolver(recipeDraftSchema),
  });

  const validationErrors = fieldOrder.flatMap((field) => {
    const message = errors[field]?.message;
    return message ? [{ field, message }] : [];
  });

  useEffect(() => {
    if (submitCount > 0 && validationErrors.length > 0) {
      summaryRef.current?.focus();
    }
  }, [submitCount, validationErrors.length]);

  useEffect(() => {
    if (serverState.kind !== "none") {
      serverBannerRef.current?.focus();
    }
  }, [serverState]);

  async function onSubmit(values: RecipeDraftRequest) {
    setServerState({ kind: "none" });

    try {
      const response = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = (await response.json()) as {
        data?: { editUrl?: string };
        error?: { message?: string };
      };

      if (response.status === 201 && payload.data?.editUrl) {
        router.push(payload.data.editUrl);
        return;
      }

      if (response.status === 401) {
        setServerState({
          kind: "auth",
          message: "Your session expired. Sign in again to continue.",
        });
        return;
      }

      setServerState({
        kind: "failure",
        message: "Your work is still here. Try again.",
      });
    } catch {
      setServerState({
        kind: "failure",
        message: "Your work is still here. Try again.",
      });
    }
  }

  const submitForm = handleSubmit(onSubmit);

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    if (submissionLock.current || isSubmitting) {
      event.preventDefault();
      return;
    }
    submissionLock.current = true;
    void submitForm(event).finally(() => {
      submissionLock.current = false;
    });
  }

  function focusField(event: MouseEvent<HTMLAnchorElement>, field: keyof RecipeDraftRequest) {
    event.preventDefault();
    document.getElementById(fieldIds[field])?.focus();
  }

  function removeRange() {
    setValue("yieldMax", "", { shouldValidate: false });
    setRangeEnabled(false);
  }

  const helperIds = {
    title: "recipe-title-helper",
    description: "recipe-description-helper",
    yield: "recipe-yield-helper",
  };
  const { onBlur: handleYieldUnitBlur, ...yieldUnitField } = register("yieldUnit");

  return (
    <>
      {serverState.kind !== "none" ? (
        <div className={styles.serverBanner} ref={serverBannerRef} role="alert" tabIndex={-1}>
          <h2>
            {serverState.kind === "auth"
              ? "Your session expired. Sign in again to continue."
              : "We couldn’t start this recipe."}
          </h2>
          {serverState.kind === "failure" ? <p>{serverState.message}</p> : null}
          {serverState.kind === "failure" ? (
            <button form="start-recipe-form" type="submit">
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      <form
        aria-busy={isSubmitting}
        className={styles.form}
        id="start-recipe-form"
        noValidate
        onSubmit={handleFormSubmit}
      >
        {validationErrors.length > 0 ? (
          <div className={styles.errorSummary} ref={summaryRef} role="alert" tabIndex={-1}>
            <h2>Fix the following before starting your recipe:</h2>
            <ul>
              {validationErrors.map(({ field, message }) => (
                <li key={field}>
                  <a href={`#${fieldIds[field]}`} onClick={(event) => focusField(event, field)}>
                    {message}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className={styles.field}>
          <label htmlFor={fieldIds.title}>Recipe title</label>
          <p className={styles.helper} id={helperIds.title}>
            Use the name your family will recognize.
          </p>
          <input
            aria-describedby={`${helperIds.title}${errors.title ? " recipe-title-error" : ""}`}
            aria-invalid={Boolean(errors.title)}
            autoComplete="off"
            autoFocus
            id={fieldIds.title}
            maxLength={120}
            type="text"
            {...register("title")}
          />
          {errors.title ? (
            <p className={styles.error} id="recipe-title-error">
              {errors.title.message}
            </p>
          ) : null}
        </div>

        <div className={styles.field}>
          <label htmlFor={fieldIds.description}>Description (optional)</label>
          <p className={styles.helper} id={helperIds.description}>
            A short summary shown when the recipe is published.
          </p>
          <textarea
            aria-describedby={`${helperIds.description}${
              errors.description ? " recipe-description-error" : ""
            }`}
            aria-invalid={Boolean(errors.description)}
            id={fieldIds.description}
            maxLength={500}
            rows={3}
            {...register("description")}
          />
          {errors.description ? (
            <p className={styles.error} id="recipe-description-error">
              {errors.description.message}
            </p>
          ) : null}
        </div>

        <fieldset className={styles.yieldFieldset}>
          <legend>Yield (optional)</legend>
          <p className={styles.helper} id={helperIds.yield}>
            Leave blank if the recipe does not have a fixed yield.
          </p>
          <div
            className={`${styles.yieldGrid} ${
              rangeEnabled ? styles.yieldGridRange : styles.yieldGridSingle
            }`}
          >
            <div className={styles.field}>
              <label htmlFor={fieldIds.yieldMin}>
                {rangeEnabled ? "Starting amount" : "Amount"}
              </label>
              <input
                aria-describedby={`${helperIds.yield}${
                  errors.yieldMin ? " recipe-yield-min-error" : ""
                }`}
                aria-invalid={Boolean(errors.yieldMin)}
                id={fieldIds.yieldMin}
                inputMode="decimal"
                max="9999999.999"
                step="any"
                type="number"
                {...register("yieldMin")}
              />
              {errors.yieldMin ? (
                <p className={styles.error} id="recipe-yield-min-error">
                  {errors.yieldMin.message}
                </p>
              ) : null}
            </div>

            {rangeEnabled ? (
              <div className={styles.field}>
                <label htmlFor={fieldIds.yieldMax}>Ending amount</label>
                <input
                  aria-describedby={`${helperIds.yield}${
                    errors.yieldMax ? " recipe-yield-max-error" : ""
                  }`}
                  aria-invalid={Boolean(errors.yieldMax)}
                  id={fieldIds.yieldMax}
                  inputMode="decimal"
                  max="9999999.999"
                  step="any"
                  type="number"
                  {...register("yieldMax")}
                />
                {errors.yieldMax ? (
                  <p className={styles.error} id="recipe-yield-max-error">
                    {errors.yieldMax.message}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className={styles.field}>
              <label htmlFor={fieldIds.yieldUnit}>Unit</label>
              <input
                aria-describedby={errors.yieldUnit ? "recipe-yield-unit-error" : undefined}
                aria-invalid={Boolean(errors.yieldUnit)}
                id={fieldIds.yieldUnit}
                maxLength={40}
                onBlur={(event) => {
                  void handleYieldUnitBlur(event);
                  setUnitFocused(false);
                }}
                onFocus={() => setUnitFocused(true)}
                placeholder={unitFocused ? "" : "servings"}
                type="text"
                {...yieldUnitField}
              />
              {errors.yieldUnit ? (
                <p className={styles.error} id="recipe-yield-unit-error">
                  {errors.yieldUnit.message}
                </p>
              ) : null}
            </div>
          </div>

          <button
            className={styles.rangeButton}
            onClick={rangeEnabled ? removeRange : () => setRangeEnabled(true)}
            type="button"
          >
            {rangeEnabled ? "Remove range" : "Add a range"}
          </button>
        </fieldset>

        <div aria-live="polite" className={styles.liveStatus}>
          {isSubmitting ? "Creating your draft…" : ""}
        </div>
        <button className={styles.submitButton} disabled={isSubmitting} type="submit">
          {isSubmitting ? "Starting recipe…" : "Start recipe"}
        </button>
      </form>
    </>
  );
}
