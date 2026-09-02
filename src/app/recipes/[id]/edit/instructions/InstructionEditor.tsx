"use client";

import { type FormEvent, type MouseEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  type RecipeStep,
  type RecipeStepConditionOption,
  type RecipeStepEditorData,
  recipeStepRequestSchema,
} from "@/utils/recipe-step";

import styles from "./instruction-stage.module.scss";

type Banner = "none" | "auth" | "conflict" | "failure";
type ConditionKind = "always" | "choice_option" | "optional_ingredient";

export function InstructionEditor({ data }: { data: RecipeStepEditorData }) {
  const router = useRouter();
  const [steps, setSteps] = useState(data.steps);
  const [version, setVersion] = useState(data.recipe.version);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [instruction, setInstruction] = useState("");
  const [conditionKind, setConditionKind] = useState<ConditionKind>("always");
  const [conditionIngredientId, setConditionIngredientId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<Banner>("none");
  const [status, setStatus] = useState("Draft saved");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const mutationLock = useRef(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const editButtons = useRef(new Map<string, HTMLButtonElement>());
  const conditionOptions = data.conditionOptions ?? [];

  useEffect(() => {
    if (editingId !== null) queueMicrotask(() => textareaRef.current?.focus());
  }, [editingId]);

  useEffect(() => {
    if (Object.keys(fieldErrors).length > 0) queueMicrotask(() => summaryRef.current?.focus());
  }, [fieldErrors]);

  useEffect(() => {
    if (banner !== "none") bannerRef.current?.focus();
  }, [banner]);

  function resetForm() {
    setInstruction("");
    setConditionKind("always");
    setConditionIngredientId("");
    setFieldErrors({});
  }

  function openNew() {
    resetForm();
    setBanner("none");
    setDeletingId(null);
    setEditingId("new");
  }

  function openEdit(step: RecipeStep) {
    setInstruction(step.instruction);
    setConditionKind(step.conditionKind ?? "always");
    setConditionIngredientId(step.conditionIngredientId ?? "");
    setFieldErrors({});
    setBanner("none");
    setDeletingId(null);
    setEditingId(step.id);
  }

  function cancelEdit() {
    const previousId = editingId;
    setEditingId(null);
    resetForm();
    if (previousId && previousId !== "new") {
      queueMicrotask(() => editButtons.current.get(previousId)?.focus());
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutationLock.current || pending || banner === "conflict" || editingId === null) return;
    const validation = recipeStepRequestSchema.safeParse({
      expectedVersion: version,
      instruction,
      conditionKind,
      conditionIngredientId,
    });
    if (!validation.success) {
      setFieldErrors(validation.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    const isNew = editingId === "new";
    const endpoint = isNew
      ? `/api/recipes/${data.recipe.id}/steps`
      : `/api/recipes/${data.recipe.id}/steps/${editingId}`;
    const result = await mutate(endpoint, isNew ? "POST" : "PATCH", validation.data);
    if (!result) return;
    const returned = result.step as RecipeStep;
    const step = {
      ...returned,
      conditionLabel: returned.conditionIngredientId
        ? (conditionOptions.find((option) => option.id === returned.conditionIngredientId)?.label ??
          "Unavailable condition")
        : null,
    };
    setVersion(result.version as number);
    setSteps((current) =>
      isNew
        ? [...current, step]
        : current.map((existing) => (existing.id === step.id ? step : existing)),
    );
    setEditingId(null);
    resetForm();
    setStatus("Instruction saved.");
  }

  async function deleteStep(id: string) {
    const result = await mutate(`/api/recipes/${data.recipe.id}/steps/${id}`, "DELETE", {
      expectedVersion: version,
    });
    if (!result) return;
    setVersion(result.version as number);
    setSteps((current) =>
      (result.stepIds as string[]).map((stepId, position) => ({
        ...current.find((step) => step.id === stepId)!,
        position,
      })),
    );
    setDeletingId(null);
    setStatus("Instruction saved.");
  }

  async function move(index: number, direction: -1 | 1) {
    const reordered = [...steps];
    const target = index + direction;
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const result = await mutate(`/api/recipes/${data.recipe.id}/steps/order`, "PUT", {
      expectedVersion: version,
      stepIds: reordered.map((step) => step.id),
    });
    if (!result) return;
    setVersion(result.version as number);
    setSteps(reordered.map((step, position) => ({ ...step, position })));
    setStatus("Instruction saved.");
  }

  async function mutate(endpoint: string, method: string, body: unknown) {
    if (mutationLock.current || banner === "conflict") return null;
    mutationLock.current = true;
    setPending(true);
    setStatus("Saving instruction...");
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
        error?: { fieldErrors?: Record<string, string[]> };
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
                : "We couldn't save that instruction change."}
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
      {steps.length === 0 && editingId === null ? (
        <div className={styles.emptyState}>
          <h2>No instructions yet</h2>
          <p>Add the first step for this recipe.</p>
        </div>
      ) : null}
      {steps.length > 0 ? (
        <ol className={styles.stepList}>
          {steps.map((step, index) => (
            <li className={styles.step} key={step.id}>
              <p className={styles.stepLabel}>Step {index + 1}</p>
              <p className={styles.conditionLabel}>
                {step.conditionKind
                  ? `Applies when: ${step.conditionLabel ?? "Unavailable condition"}`
                  : "Applies when: Always"}
              </p>
              {editingId === step.id ? (
                <InstructionForm
                  cancel={cancelEdit}
                  conditionIngredientId={conditionIngredientId}
                  conditionKind={conditionKind}
                  conditionOptions={conditionOptions}
                  fieldErrors={fieldErrors}
                  instruction={instruction}
                  mutationDisabled={banner === "conflict"}
                  pending={pending}
                  setCondition={(kind, ingredientId) => {
                    setConditionKind(kind);
                    setConditionIngredientId(ingredientId);
                  }}
                  setInstruction={setInstruction}
                  submit={submit}
                  submitLabel="Save changes"
                  summaryRef={summaryRef}
                  textareaRef={textareaRef}
                />
              ) : (
                <>
                  <p className={styles.instruction}>{step.instruction}</p>
                  <div className={styles.actions}>
                    <button
                      disabled={pending || banner === "conflict"}
                      onClick={() => openEdit(step)}
                      ref={(element) => {
                        if (element) editButtons.current.set(step.id, element);
                        else editButtons.current.delete(step.id);
                      }}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      disabled={pending || banner === "conflict"}
                      onClick={() => setDeletingId(step.id)}
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
                      disabled={index === steps.length - 1 || pending || banner === "conflict"}
                      onClick={() => void move(index, 1)}
                      type="button"
                    >
                      Move down
                    </button>
                  </div>
                  {deletingId === step.id ? (
                    <div className={styles.deleteConfirmation}>
                      <p>Delete step?</p>
                      <button
                        disabled={pending || banner === "conflict"}
                        onClick={() => void deleteStep(step.id)}
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
        </ol>
      ) : null}
      {editingId === "new" ? (
        <InstructionForm
          cancel={cancelEdit}
          conditionIngredientId={conditionIngredientId}
          conditionKind={conditionKind}
          conditionOptions={conditionOptions}
          fieldErrors={fieldErrors}
          instruction={instruction}
          mutationDisabled={banner === "conflict"}
          pending={pending}
          setCondition={(kind, ingredientId) => {
            setConditionKind(kind);
            setConditionIngredientId(ingredientId);
          }}
          setInstruction={setInstruction}
          submit={submit}
          submitLabel="Add step"
          summaryRef={summaryRef}
          textareaRef={textareaRef}
        />
      ) : null}
      {editingId === null ? (
        <button
          className={styles.addButton}
          disabled={pending || banner === "conflict"}
          onClick={openNew}
          type="button"
        >
          Add step
        </button>
      ) : null}
    </section>
  );
}

function InstructionForm({
  cancel,
  conditionIngredientId,
  conditionKind,
  conditionOptions,
  fieldErrors,
  instruction,
  mutationDisabled,
  pending,
  setCondition,
  setInstruction,
  submit,
  submitLabel,
  summaryRef,
  textareaRef,
}: {
  cancel: () => void;
  conditionIngredientId: string;
  conditionKind: ConditionKind;
  conditionOptions: RecipeStepConditionOption[];
  fieldErrors: Record<string, string[]>;
  instruction: string;
  mutationDisabled: boolean;
  pending: boolean;
  setCondition: (kind: ConditionKind, ingredientId: string) => void;
  setInstruction: (value: string) => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  summaryRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const instructionErrors = fieldErrors.instruction ?? [];
  const conditionErrors = fieldErrors.conditionIngredientId ?? [];
  const errors = [
    ...instructionErrors.map((message) => ({ id: "instruction", message })),
    ...conditionErrors.map((message) => ({ id: "step-condition", message })),
  ];
  function focusField(event: MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault();
    document.getElementById(id)?.focus();
  }
  return (
    <form className={styles.form} noValidate onSubmit={submit}>
      {errors.length > 0 ? (
        <div className={styles.errorSummary} ref={summaryRef} role="alert" tabIndex={-1}>
          <h2>Fix the following instruction fields:</h2>
          <ul>
            {errors.map(({ id, message }) => (
              <li key={`${id}-${message}`}>
                <a href={`#${id}`} onClick={(event) => focusField(event, id)}>
                  {message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <label htmlFor="instruction">Instruction</label>
      <textarea
        aria-describedby={instructionErrors.length > 0 ? "instruction-error" : undefined}
        aria-invalid={instructionErrors.length > 0}
        id="instruction"
        maxLength={2_000}
        onChange={(event) => setInstruction(event.target.value)}
        ref={textareaRef}
        rows={5}
        value={instruction}
      />
      {instructionErrors[0] ? (
        <p className={styles.error} id="instruction-error">
          {instructionErrors[0]}
        </p>
      ) : null}
      <label htmlFor="step-condition">Applies when</label>
      <select
        aria-describedby={conditionErrors.length > 0 ? "step-condition-error" : undefined}
        aria-invalid={conditionErrors.length > 0}
        id="step-condition"
        onChange={(event) => {
          const [kind, ingredientId = ""] = event.target.value.split(":");
          setCondition(kind as ConditionKind, ingredientId);
        }}
        value={conditionKind === "always" ? "always" : `${conditionKind}:${conditionIngredientId}`}
      >
        <option value="always">Always</option>
        {conditionOptions.map((option) => (
          <option key={option.id} value={`${option.kind}:${option.id}`}>
            {option.label}
          </option>
        ))}
      </select>
      {conditionErrors[0] ? (
        <p className={styles.error} id="step-condition-error">
          {conditionErrors[0]}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button disabled={pending || mutationDisabled} type="submit">
          {submitLabel}
        </button>
        <button disabled={pending} onClick={cancel} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}
