"use client";

import { type FormEvent, type MouseEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  type RecipeStep,
  type RecipeStepEditorData,
  recipeStepRequestSchema,
} from "@/utils/recipe-step";

import styles from "./instruction-stage.module.scss";

type Banner = "none" | "auth" | "conflict" | "failure";

export function InstructionEditor({ data }: { data: RecipeStepEditorData }) {
  const router = useRouter();
  const [steps, setSteps] = useState(data.steps);
  const [version, setVersion] = useState(data.recipe.version);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [instruction, setInstruction] = useState("");
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<Banner>("none");
  const [status, setStatus] = useState("Draft saved");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const mutationLock = useRef(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const editButtons = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (editingId !== null) queueMicrotask(() => textareaRef.current?.focus());
  }, [editingId]);

  useEffect(() => {
    if (fieldErrors.length > 0) queueMicrotask(() => summaryRef.current?.focus());
  }, [fieldErrors]);

  useEffect(() => {
    if (banner !== "none") bannerRef.current?.focus();
  }, [banner]);

  function openNew() {
    setInstruction("");
    setFieldErrors([]);
    setBanner("none");
    setDeletingId(null);
    setEditingId("new");
  }

  function openEdit(step: RecipeStep) {
    setInstruction(step.instruction);
    setFieldErrors([]);
    setBanner("none");
    setDeletingId(null);
    setEditingId(step.id);
  }

  function cancelEdit() {
    const previousId = editingId;
    setEditingId(null);
    setInstruction("");
    setFieldErrors([]);
    if (previousId && previousId !== "new") {
      queueMicrotask(() => editButtons.current.get(previousId)?.focus());
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutationLock.current || pending || banner === "conflict" || editingId === null) return;
    const validation = recipeStepRequestSchema.safeParse({ expectedVersion: version, instruction });
    if (!validation.success) {
      setFieldErrors(validation.error.flatten().fieldErrors.instruction ?? []);
      return;
    }
    const isNew = editingId === "new";
    const endpoint = isNew
      ? `/api/recipes/${data.recipe.id}/steps`
      : `/api/recipes/${data.recipe.id}/steps/${editingId}`;
    const result = await mutate(endpoint, isNew ? "POST" : "PATCH", validation.data);
    if (!result) return;
    const step = result.step as RecipeStep;
    setVersion(result.version as number);
    setSteps((current) =>
      isNew
        ? [...current, step]
        : current.map((existing) => (existing.id === step.id ? step : existing)),
    );
    setEditingId(null);
    setInstruction("");
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
    if (mutationLock.current) return null;
    mutationLock.current = true;
    setPending(true);
    setStatus("Saving instruction...");
    setBanner("none");
    setFieldErrors([]);
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
      if (
        response.status === 400 &&
        payload.error?.fieldErrors?.instruction &&
        editingId !== null
      ) {
        setFieldErrors(payload.error.fieldErrors.instruction);
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
              {editingId === step.id ? (
                <InstructionForm
                  cancel={cancelEdit}
                  fieldErrors={fieldErrors}
                  instruction={instruction}
                  mutationDisabled={banner === "conflict"}
                  pending={pending}
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
                        if (element) {
                          editButtons.current.set(step.id, element);
                        } else {
                          editButtons.current.delete(step.id);
                        }
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
                        disabled={pending}
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
          fieldErrors={fieldErrors}
          instruction={instruction}
          mutationDisabled={banner === "conflict"}
          pending={pending}
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
  fieldErrors,
  instruction,
  mutationDisabled,
  pending,
  setInstruction,
  submit,
  submitLabel,
  summaryRef,
  textareaRef,
}: {
  cancel: () => void;
  fieldErrors: string[];
  instruction: string;
  mutationDisabled: boolean;
  pending: boolean;
  setInstruction: (value: string) => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  summaryRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  function focusInstruction(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    textareaRef.current?.focus();
  }
  return (
    <form className={styles.form} noValidate onSubmit={submit}>
      {fieldErrors.length > 0 ? (
        <div className={styles.errorSummary} ref={summaryRef} role="alert" tabIndex={-1}>
          <h2>Fix the following instruction fields:</h2>
          <ul>
            {fieldErrors.map((message) => (
              <li key={message}>
                <a href="#instruction" onClick={focusInstruction}>
                  {message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <label htmlFor="instruction">Instruction</label>
      <textarea
        aria-describedby={fieldErrors.length > 0 ? "instruction-error" : undefined}
        aria-invalid={fieldErrors.length > 0}
        id="instruction"
        maxLength={2_000}
        onChange={(event) => setInstruction(event.target.value)}
        ref={textareaRef}
        rows={5}
        value={instruction}
      />
      {fieldErrors[0] ? (
        <p className={styles.error} id="instruction-error">
          {fieldErrors[0]}
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
