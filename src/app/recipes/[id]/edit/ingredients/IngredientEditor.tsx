"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  formatRecipeIngredientLine,
  type RecipeIngredientChoiceGroup,
  type RecipeIngredientEditorData,
  type RecipeIngredientLine,
  type RecipeIngredientSection,
  type RecipeIngredientStructureAction,
  recipeIngredientInputSchema,
  recipeIngredientRequestSchema,
} from "@/utils/recipe-ingredient";

import {
  emptyIngredientForm,
  IngredientForm,
  ingredientFieldIds,
  ingredientFormFromLine,
  type IngredientFormValues,
} from "./IngredientForm";
import styles from "./ingredient-stage.module.scss";

type Banner = "none" | "auth" | "conflict" | "failure";
type EditingMode = string | "new" | `create-group:${string}` | `new-option:${string}` | null;
type LinkedStep = { id: string; position: number; instruction: string };
type SectionItem =
  | { type: "ingredient"; id: string; lines: RecipeIngredientLine[] }
  | {
      type: "group";
      id: string;
      lines: RecipeIngredientLine[];
      group: RecipeIngredientChoiceGroup;
    };

const legacySectionId = "legacy-section";

export function IngredientEditor({ data }: { data: RecipeIngredientEditorData }) {
  const router = useRouter();
  const structured = data.sections !== undefined;
  const sections: RecipeIngredientSection[] = data.sections ?? [
    { id: legacySectionId, name: null, position: 0 },
  ];
  const groups = data.choiceGroups ?? [];
  const [lines, setLines] = useState(data.lines);
  const [version, setVersion] = useState(data.recipe.version);
  const [editingId, setEditingId] = useState<EditingMode>(null);
  const [editingSectionId, setEditingSectionId] = useState(sections[0]?.id ?? legacySectionId);
  const [form, setForm] = useState<IngredientFormValues>(emptyIngredientForm);
  const [ingredientQuery, setIngredientQuery] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<Banner>("none");
  const [status, setStatus] = useState("Draft saved");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [deletingSectionId, setDeletingSectionId] = useState<string | null>(null);
  const [sectionDispositionTarget, setSectionDispositionTarget] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [renamingSectionId, setRenamingSectionId] = useState<string | null>(null);
  const [groupLabel, setGroupLabel] = useState("");
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ message: string; linkedSteps: LinkedStep[] } | null>(
    null,
  );
  const mutationLock = useRef(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const editButtons = useRef(new Map<string, HTMLButtonElement>());
  const mutationsDisabled = pending || banner === "conflict";

  useEffect(() => {
    if (editingId !== null) {
      queueMicrotask(() => {
        document
          .getElementById(
            form.ingredientSource === "canonical"
              ? ingredientFieldIds.ingredientId
              : ingredientFieldIds.customIngredient,
          )
          ?.focus();
      });
    }
  }, [editingId, form.ingredientSource]);

  useEffect(() => {
    if (banner !== "none") bannerRef.current?.focus();
  }, [banner]);

  function resetForm() {
    setEditingId(null);
    setForm(emptyIngredientForm);
    setIngredientQuery("");
    setFieldErrors({});
    setGroupLabel("");
  }

  function openNew(sectionId = sections[0]?.id ?? legacySectionId) {
    resetForm();
    setEditingSectionId(sectionId);
    setBanner("none");
    setBlocked(null);
    setDeletingId(null);
    setEditingId("new");
  }

  function openEdit(line: RecipeIngredientLine) {
    setForm(ingredientFormFromLine(line));
    setIngredientQuery(line.ingredientId ? line.ingredientName : "");
    setFieldErrors({});
    setBanner("none");
    setBlocked(null);
    setDeletingId(null);
    setEditingSectionId(line.sectionId ?? sections[0]?.id ?? legacySectionId);
    setEditingId(line.id);
  }

  function openCreateGroup(line: RecipeIngredientLine) {
    setForm({ ...emptyIngredientForm, isOptional: false });
    setIngredientQuery("");
    setFieldErrors({});
    setGroupLabel("");
    setEditingSectionId(line.sectionId ?? sections[0]?.id ?? legacySectionId);
    setEditingId(`create-group:${line.id}`);
  }

  function openNewOption(group: RecipeIngredientChoiceGroup) {
    setForm({ ...emptyIngredientForm, isOptional: false });
    setIngredientQuery("");
    setFieldErrors({});
    setEditingSectionId(group.sectionId);
    setEditingId(`new-option:${group.id}`);
  }

  function cancelEdit() {
    const previousId = editingId;
    resetForm();
    if (previousId && !previousId.includes(":") && previousId !== "new") {
      queueMicrotask(() => editButtons.current.get(previousId)?.focus());
    }
  }

  function updateField<Key extends keyof IngredientFormValues>(
    key: Key,
    value: IngredientFormValues[Key],
  ) {
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
        } else if (value === "range") next.quantityText = "";
        else if (value === "text") {
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
    if (mutationLock.current || pending || banner === "conflict" || editingId === null) return;
    const validation = recipeIngredientRequestSchema.safeParse({
      ...form,
      expectedVersion: version,
    });
    if (!validation.success) {
      setFieldErrors(validation.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    const option = recipeIngredientInputSchema.parse(validation.data);

    if (editingId.startsWith("create-group:")) {
      if (!groupLabel.trim()) {
        setFieldErrors({ groupLabel: ["Enter an alternative label."] });
        return;
      }
      const ingredientId = editingId.slice("create-group:".length);
      if (
        await structure({
          type: "createGroup",
          ingredientId,
          label: groupLabel,
          option: { ...option, isOptional: false },
        })
      ) {
        resetForm();
      }
      return;
    }
    if (editingId.startsWith("new-option:")) {
      const groupId = editingId.slice("new-option:".length);
      if (
        await structure({
          type: "addGroupOption",
          groupId,
          option: { ...option, isOptional: false },
        })
      ) {
        resetForm();
      }
      return;
    }

    const isNew = editingId === "new";
    const endpoint = isNew
      ? `/api/recipes/${data.recipe.id}/ingredients`
      : `/api/recipes/${data.recipe.id}/ingredients/${editingId}`;
    const body =
      isNew && structured ? { ...validation.data, sectionId: editingSectionId } : validation.data;
    const result = await mutate(endpoint, isNew ? "POST" : "PATCH", body);
    if (!result) return;
    const returned = result.line as RecipeIngredientLine;
    const line = {
      ...returned,
      sectionId: returned.sectionId ?? editingSectionId,
      choiceGroupId:
        returned.choiceGroupId ??
        (isNew
          ? null
          : (lines.find((current) => current.id === returned.id)?.choiceGroupId ?? null)),
    };
    setVersion(result.version as number);
    setLines((current) =>
      isNew
        ? [...current, line]
        : current.map((existing) => (existing.id === line.id ? line : existing)),
    );
    resetForm();
    setStatus("Ingredient saved.");
  }

  async function deleteLine(id: string) {
    const result = await mutate(`/api/recipes/${data.recipe.id}/ingredients/${id}`, "DELETE", {
      expectedVersion: version,
    });
    if (!result) return;
    setVersion(result.version as number);
    const ids = result.ingredientIds as string[];
    const deletedId = result.deletedIngredientId as string;
    setLines((current) =>
      current
        .filter((line) => line.id !== deletedId)
        .map((line) =>
          ids.includes(line.id) ? { ...line, position: ids.indexOf(line.id) } : line,
        ),
    );
    setDeletingId(null);
    setStatus("Ingredient saved.");
  }

  async function moveLegacy(index: number, direction: -1 | 1) {
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

  async function structure(action: RecipeIngredientStructureAction) {
    if (banner === "conflict") return false;
    const result = await mutate(`/api/recipes/${data.recipe.id}/ingredients/structure`, "PUT", {
      expectedVersion: version,
      action,
    });
    if (!result) return false;
    setVersion(result.version as number);
    setStatus("Ingredient structure saved.");
    router.refresh();
    return true;
  }

  async function mutate(endpoint: string, method: string, body: unknown) {
    if (mutationLock.current || banner === "conflict") return null;
    mutationLock.current = true;
    setPending(true);
    setStatus("Saving ingredient…");
    setBanner("none");
    setBlocked(null);
    setFieldErrors({});
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        data?: Record<string, unknown>;
        error?: {
          code?: string;
          message?: string;
          fieldErrors?: Record<string, string[]>;
          linkedSteps?: LinkedStep[];
        };
      };
      if (response.ok && payload.data) return payload.data;
      if (response.status === 400 && payload.error?.fieldErrors) {
        setFieldErrors(payload.error.fieldErrors);
      } else if (response.status === 401) setBanner("auth");
      else if (response.status === 409 && payload.error?.code === "VERSION_CONFLICT") {
        setBanner("conflict");
      } else if (response.status === 409 && payload.error?.message) {
        setBlocked({
          message: payload.error.message,
          linkedSteps: payload.error.linkedSteps ?? [],
        });
      } else setBanner("failure");
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

  function sectionLines(sectionId: string) {
    return lines
      .filter((line) => (line.sectionId ?? sections[0]?.id ?? legacySectionId) === sectionId)
      .sort((left, right) => left.position - right.position);
  }

  function itemsForSection(sectionId: string): SectionItem[] {
    const items: SectionItem[] = [];
    for (const line of sectionLines(sectionId)) {
      if (!line.choiceGroupId) {
        items.push({ type: "ingredient", id: line.id, lines: [line] });
        continue;
      }
      const prior = items.at(-1);
      if (prior?.type === "group" && prior.id === line.choiceGroupId) {
        prior.lines.push(line);
        continue;
      }
      const group = groups.find((candidate) => candidate.id === line.choiceGroupId);
      if (group) items.push({ type: "group", id: group.id, lines: [line], group });
    }
    return items;
  }

  function formForCurrentMode() {
    if (editingId === null) return null;
    const alternative = editingId.startsWith("create-group:");
    const option = editingId.startsWith("new-option:");
    return (
      <>
        {alternative ? (
          <div className={styles.groupLabelField}>
            <label htmlFor="choice-group-label">Alternative label</label>
            <input
              aria-describedby={fieldErrors.groupLabel ? "choice-group-label-error" : undefined}
              aria-invalid={Boolean(fieldErrors.groupLabel)}
              id="choice-group-label"
              maxLength={80}
              onChange={(event) => setGroupLabel(event.target.value)}
              value={groupLabel}
            />
            {fieldErrors.groupLabel?.[0] ? (
              <p className={styles.error} id="choice-group-label-error">
                {fieldErrors.groupLabel[0]}
              </p>
            ) : null}
          </div>
        ) : null}
        <IngredientForm
          cancel={cancelEdit}
          data={data}
          fieldErrors={
            Object.fromEntries(
              Object.entries(fieldErrors).filter(([field]) => field !== "groupLabel"),
            ) as Record<string, string[]>
          }
          form={form}
          ingredientQuery={ingredientQuery}
          optionalDisabled={alternative || option || Boolean(currentEditedLine()?.choiceGroupId)}
          pending={pending}
          mutationDisabled={banner === "conflict"}
          setIngredientQuery={setIngredientQuery}
          submit={submit}
          submitLabel={
            alternative
              ? "Create alternative"
              : option
                ? "Add option"
                : editingId === "new"
                  ? "Add ingredient"
                  : "Save changes"
          }
          updateField={updateField}
        />
      </>
    );
  }

  function currentEditedLine() {
    return editingId && !editingId.includes(":") && editingId !== "new"
      ? lines.find((line) => line.id === editingId)
      : undefined;
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
                : "We couldn’t save that ingredient change."}
          </h2>
          {banner === "conflict" ? (
            <>
              <p>Reload the latest version before making another change.</p>
              <button
                className={styles.primaryAction}
                onClick={() => router.refresh()}
                type="button"
              >
                Reload draft
              </button>
            </>
          ) : null}
          {banner === "failure" ? <p>Your work is still here. Try again.</p> : null}
        </div>
      ) : null}
      {blocked ? (
        <div className={styles.blockedHelp} role="alert">
          <p>{blocked.message}</p>
          {blocked.linkedSteps.length > 0 ? (
            <ul>
              {blocked.linkedSteps.map((step) => (
                <li key={step.id}>
                  Step {step.position + 1}: {step.instruction}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {(fieldErrors.name ?? fieldErrors.action ?? fieldErrors.sectionId)?.[0] ? (
        <div className={styles.blockedHelp} role="alert">
          {(fieldErrors.name ?? fieldErrors.action ?? fieldErrors.sectionId)?.[0]}
        </div>
      ) : null}

      {lines.length === 0 && editingId === null ? (
        <div className={styles.emptyState}>
          <h2>No ingredients yet</h2>
          <p>Add the first ingredient for this recipe.</p>
        </div>
      ) : null}

      {sections.map((section, sectionIndex) => {
        const items = itemsForSection(section.id);
        return (
          <section className={structured ? styles.ingredientSection : undefined} key={section.id}>
            {structured ? (
              <SectionHeader
                deleteActive={deletingSectionId === section.id}
                disabled={mutationsDisabled}
                index={sectionIndex}
                name={section.name}
                onBeginDelete={() => {
                  setDeletingSectionId(section.id);
                  setSectionDispositionTarget(
                    sections.find((candidate) => candidate.id !== section.id)?.id ?? "",
                  );
                }}
                onBeginRename={() => {
                  setRenamingSectionId(section.id);
                  setSectionName(section.name ?? "");
                }}
                onMove={(direction) => {
                  const reordered = [...sections];
                  const target = sectionIndex + direction;
                  [reordered[sectionIndex], reordered[target]] = [
                    reordered[target],
                    reordered[sectionIndex],
                  ];
                  void structure({
                    type: "reorderSections",
                    sectionIds: reordered.map((candidate) => candidate.id),
                  });
                }}
                sectionCount={sections.length}
              />
            ) : null}
            {renamingSectionId === section.id ? (
              <InlineNameForm
                label="Section name"
                onCancel={() => {
                  setRenamingSectionId(null);
                  setSectionName("");
                }}
                onSubmit={() => {
                  void structure({
                    type: "renameSection",
                    sectionId: section.id,
                    name: sectionName,
                  }).then((saved) => {
                    if (saved) {
                      setRenamingSectionId(null);
                      setSectionName("");
                    }
                  });
                }}
                pending={pending}
                setValue={setSectionName}
                value={sectionName}
              />
            ) : null}
            {deletingSectionId === section.id ? (
              <div className={styles.deleteConfirmation}>
                <p>Delete this section?</p>
                {sectionLines(section.id).length > 0 ? (
                  <>
                    <label htmlFor={`move-section-${section.id}`}>Move its contents to</label>
                    <select
                      id={`move-section-${section.id}`}
                      onChange={(event) => setSectionDispositionTarget(event.target.value)}
                      value={sectionDispositionTarget}
                    >
                      {sections
                        .filter((candidate) => candidate.id !== section.id)
                        .map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.name ?? "Unnamed section"}
                          </option>
                        ))}
                    </select>
                    <button
                      className={styles.dangerAction}
                      disabled={mutationsDisabled}
                      onClick={() =>
                        void structure({
                          type: "deleteSection",
                          sectionId: section.id,
                          disposition: "move",
                          targetSectionId: sectionDispositionTarget,
                        })
                      }
                      type="button"
                    >
                      Move contents and delete section
                    </button>
                    <button
                      className={styles.dangerAction}
                      disabled={mutationsDisabled}
                      onClick={() =>
                        void structure({
                          type: "deleteSection",
                          sectionId: section.id,
                          disposition: "delete",
                        })
                      }
                      type="button"
                    >
                      Delete section and contents
                    </button>
                  </>
                ) : (
                  <button
                    className={styles.dangerAction}
                    disabled={mutationsDisabled}
                    onClick={() =>
                      void structure({
                        type: "deleteSection",
                        sectionId: section.id,
                        disposition: "delete",
                      })
                    }
                    type="button"
                  >
                    Delete section
                  </button>
                )}
                <button
                  className={styles.secondaryAction}
                  onClick={() => setDeletingSectionId(null)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            ) : null}
            {items.length > 0 ? (
              <ul className={styles.lineList}>
                {items.map((item, itemIndex) =>
                  item.type === "group" ? (
                    <li className={styles.choiceGroup} key={item.id}>
                      <div className={styles.groupHeading}>
                        <p>
                          <strong>{item.group.label}</strong> <span>Choose one</span>
                        </p>
                        <ItemMoveActions
                          disabled={mutationsDisabled}
                          index={itemIndex}
                          itemCount={items.length}
                          onMove={(direction) =>
                            void structure({
                              type: "moveItem",
                              itemType: "group",
                              itemId: item.id,
                              targetSectionId: section.id,
                              targetIndex: itemIndex + direction,
                            })
                          }
                        />
                      </div>
                      {renamingGroupId === item.id ? (
                        <InlineNameForm
                          label="Alternative label"
                          onCancel={() => setRenamingGroupId(null)}
                          onSubmit={() => {
                            void structure({
                              type: "renameGroup",
                              groupId: item.id,
                              label: groupLabel,
                            }).then((saved) => saved && setRenamingGroupId(null));
                          }}
                          pending={pending}
                          setValue={setGroupLabel}
                          value={groupLabel}
                        />
                      ) : null}
                      <ul className={styles.optionList}>
                        {item.lines.map((line, optionIndex) => (
                          <li className={styles.line} key={line.id}>
                            <p className={styles.lineText}>{formatRecipeIngredientLine(line)}</p>
                            {editingId === line.id ? (
                              formForCurrentMode()
                            ) : (
                              <LineActions
                                deleteActive={deletingId === line.id}
                                disabled={mutationsDisabled}
                                editButtonRef={(element) => {
                                  if (element) editButtons.current.set(line.id, element);
                                  else editButtons.current.delete(line.id);
                                }}
                                line={line}
                                onDelete={() => void deleteLine(line.id)}
                                onEdit={() => openEdit(line)}
                                onMoveOption={(direction) => {
                                  const reordered = [...item.lines];
                                  const target = optionIndex + direction;
                                  [reordered[optionIndex], reordered[target]] = [
                                    reordered[target],
                                    reordered[optionIndex],
                                  ];
                                  void structure({
                                    type: "reorderGroupOptions",
                                    groupId: item.id,
                                    optionIds: reordered.map((optionLine) => optionLine.id),
                                  });
                                }}
                                optionIndex={optionIndex}
                                optionCount={item.lines.length}
                                setDeleteActive={setDeletingId}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                      {editingId === `new-option:${item.id}` ? formForCurrentMode() : null}
                      <div className={styles.groupActions}>
                        <button
                          className={styles.primaryAction}
                          disabled={mutationsDisabled}
                          onClick={() => openNewOption(item.group)}
                          type="button"
                        >
                          Add option
                        </button>
                        <button
                          className={styles.secondaryAction}
                          disabled={mutationsDisabled}
                          onClick={() => {
                            setRenamingGroupId(item.id);
                            setGroupLabel(item.group.label);
                          }}
                          type="button"
                        >
                          Rename group
                        </button>
                        <button
                          className={styles.secondaryAction}
                          disabled={mutationsDisabled}
                          onClick={() => void structure({ type: "ungroup", groupId: item.id })}
                          type="button"
                        >
                          Ungroup
                        </button>
                        <button
                          className={styles.dangerAction}
                          disabled={mutationsDisabled}
                          onClick={() => setDeletingGroupId(item.id)}
                          type="button"
                        >
                          Delete group
                        </button>
                      </div>
                      {deletingGroupId === item.id ? (
                        <div className={styles.deleteConfirmation}>
                          <p>Delete this alternative group and all its options?</p>
                          <button
                            className={styles.dangerAction}
                            disabled={mutationsDisabled}
                            onClick={() =>
                              void structure({ type: "deleteGroup", groupId: item.id })
                            }
                            type="button"
                          >
                            Delete group
                          </button>
                          <button
                            className={styles.secondaryAction}
                            onClick={() => setDeletingGroupId(null)}
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : null}
                      {structured && sections.length > 1 ? (
                        <MoveToSection
                          itemLabel={item.group.label}
                          disabled={mutationsDisabled}
                          onMove={(targetSectionId) =>
                            void structure({
                              type: "moveItem",
                              itemType: "group",
                              itemId: item.id,
                              targetSectionId,
                              targetIndex: itemsForSection(targetSectionId).length,
                            })
                          }
                          sectionId={section.id}
                          sections={sections}
                        />
                      ) : null}
                    </li>
                  ) : (
                    <li className={styles.line} key={item.id}>
                      <p className={styles.lineText}>{formatRecipeIngredientLine(item.lines[0])}</p>
                      {editingId === item.id ? (
                        formForCurrentMode()
                      ) : (
                        <>
                          <LineActions
                            deleteActive={deletingId === item.id}
                            disabled={mutationsDisabled}
                            editButtonRef={(element) => {
                              if (element) editButtons.current.set(item.id, element);
                              else editButtons.current.delete(item.id);
                            }}
                            legacyIndex={structured ? undefined : itemIndex}
                            legacyLength={structured ? undefined : items.length}
                            line={item.lines[0]}
                            onAddAlternative={
                              structured ? () => openCreateGroup(item.lines[0]) : undefined
                            }
                            onDelete={() => void deleteLine(item.id)}
                            onEdit={() => openEdit(item.lines[0])}
                            onMoveLegacy={(direction) => void moveLegacy(itemIndex, direction)}
                            setDeleteActive={setDeletingId}
                          />
                          {structured ? (
                            <ItemMoveActions
                              disabled={mutationsDisabled}
                              index={itemIndex}
                              itemCount={items.length}
                              onMove={(direction) =>
                                void structure({
                                  type: "moveItem",
                                  itemType: "ingredient",
                                  itemId: item.id,
                                  targetSectionId: section.id,
                                  targetIndex: itemIndex + direction,
                                })
                              }
                            />
                          ) : null}
                          {structured && sections.length > 1 ? (
                            <MoveToSection
                              itemLabel={item.lines[0].ingredientName}
                              disabled={mutationsDisabled}
                              onMove={(targetSectionId) =>
                                void structure({
                                  type: "moveItem",
                                  itemType: "ingredient",
                                  itemId: item.id,
                                  targetSectionId,
                                  targetIndex: itemsForSection(targetSectionId).length,
                                })
                              }
                              sectionId={section.id}
                              sections={sections}
                            />
                          ) : null}
                        </>
                      )}
                      {editingId === `create-group:${item.id}` ? formForCurrentMode() : null}
                    </li>
                  ),
                )}
              </ul>
            ) : null}
            {editingId === "new" && editingSectionId === section.id ? formForCurrentMode() : null}
            {editingId === null ? (
              <button
                className={`${styles.addButton} ${styles.primaryAction}`}
                disabled={mutationsDisabled}
                onClick={() => openNew(section.id)}
                type="button"
              >
                {structured && sections.length > 1
                  ? `Add ingredient to ${section.name ?? "section"}`
                  : "Add ingredient"}
              </button>
            ) : null}
          </section>
        );
      })}

      {structured ? (
        <div className={styles.sectionCreation}>
          <label htmlFor="new-section-name">New section name</label>
          <input
            disabled={Boolean(renamingSectionId)}
            id="new-section-name"
            maxLength={80}
            onChange={(event) => setSectionName(event.target.value)}
            value={renamingSectionId ? "" : sectionName}
          />
          <button
            className={styles.primaryAction}
            disabled={mutationsDisabled || !sectionName.trim() || Boolean(renamingSectionId)}
            onClick={() =>
              void structure({ type: "addSection", name: sectionName }).then((saved) => {
                if (saved) setSectionName("");
              })
            }
            type="button"
          >
            Add section
          </button>
        </div>
      ) : null}
    </section>
  );
}

function LineActions({
  deleteActive,
  disabled,
  editButtonRef,
  legacyIndex,
  legacyLength,
  line,
  onAddAlternative,
  onDelete,
  onEdit,
  onMoveLegacy,
  onMoveOption,
  optionCount,
  optionIndex,
  setDeleteActive,
}: {
  deleteActive: boolean;
  disabled: boolean;
  editButtonRef?: (element: HTMLButtonElement | null) => void;
  legacyIndex?: number;
  legacyLength?: number;
  line: RecipeIngredientLine;
  onAddAlternative?: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onMoveLegacy?: (direction: -1 | 1) => void;
  onMoveOption?: (direction: -1 | 1) => void;
  optionCount?: number;
  optionIndex?: number;
  setDeleteActive: (id: string | null) => void;
}) {
  return (
    <>
      <div className={styles.lineActions}>
        <button
          className={styles.secondaryAction}
          disabled={disabled}
          onClick={onEdit}
          ref={editButtonRef}
          type="button"
        >
          Edit
        </button>
        <button
          className={styles.dangerAction}
          disabled={disabled}
          onClick={() => setDeleteActive(line.id)}
          type="button"
        >
          Delete
        </button>
        {onAddAlternative ? (
          <button
            className={styles.primaryAction}
            disabled={disabled}
            onClick={onAddAlternative}
            type="button"
          >
            Add alternative
          </button>
        ) : null}
        {onMoveLegacy && legacyIndex !== undefined && legacyLength !== undefined ? (
          <>
            <button
              className={styles.secondaryAction}
              disabled={legacyIndex === 0 || disabled}
              onClick={() => onMoveLegacy(-1)}
              type="button"
            >
              Move up
            </button>
            <button
              className={styles.secondaryAction}
              disabled={legacyIndex === legacyLength - 1 || disabled}
              onClick={() => onMoveLegacy(1)}
              type="button"
            >
              Move down
            </button>
          </>
        ) : null}
        {onMoveOption && optionIndex !== undefined && optionCount !== undefined ? (
          <>
            <button
              className={styles.secondaryAction}
              disabled={optionIndex === 0 || disabled}
              onClick={() => onMoveOption(-1)}
              type="button"
            >
              Move option up
            </button>
            <button
              className={styles.secondaryAction}
              disabled={optionIndex === optionCount - 1 || disabled}
              onClick={() => onMoveOption(1)}
              type="button"
            >
              Move option down
            </button>
          </>
        ) : null}
      </div>
      {deleteActive ? (
        <div className={styles.deleteConfirmation}>
          <p>Delete ingredient?</p>
          <button
            className={styles.dangerAction}
            disabled={disabled}
            onClick={onDelete}
            type="button"
          >
            Delete
          </button>
          <button
            className={styles.secondaryAction}
            onClick={() => setDeleteActive(null)}
            type="button"
          >
            Cancel
          </button>
        </div>
      ) : null}
    </>
  );
}

function ItemMoveActions({
  disabled,
  index,
  itemCount,
  onMove,
}: {
  disabled: boolean;
  index: number;
  itemCount: number;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className={styles.itemMoveActions}>
      <button
        className={styles.secondaryAction}
        disabled={index === 0 || disabled}
        onClick={() => onMove(-1)}
        type="button"
      >
        Move up
      </button>
      <button
        className={styles.secondaryAction}
        disabled={index === itemCount - 1 || disabled}
        onClick={() => onMove(1)}
        type="button"
      >
        Move down
      </button>
    </div>
  );
}

function MoveToSection({
  disabled,
  itemLabel,
  onMove,
  sectionId,
  sections,
}: {
  disabled: boolean;
  itemLabel: string;
  onMove: (sectionId: string) => void;
  sectionId: string;
  sections: RecipeIngredientSection[];
}) {
  return (
    <label className={styles.moveToSection}>
      Move {itemLabel} to section
      <select
        disabled={disabled}
        onChange={(event) => {
          if (event.target.value !== sectionId) onMove(event.target.value);
        }}
        value={sectionId}
      >
        {sections.map((section) => (
          <option key={section.id} value={section.id}>
            {section.name ?? "Unnamed section"}
          </option>
        ))}
      </select>
    </label>
  );
}

function SectionHeader({
  deleteActive,
  disabled,
  index,
  name,
  onBeginDelete,
  onBeginRename,
  onMove,
  sectionCount,
}: {
  deleteActive: boolean;
  disabled: boolean;
  index: number;
  name: string | null;
  onBeginDelete: () => void;
  onBeginRename: () => void;
  onMove: (direction: -1 | 1) => void;
  sectionCount: number;
}) {
  return (
    <header className={styles.sectionHeader}>
      <h2>{name ?? "Ingredients"}</h2>
      <div className={styles.sectionActions}>
        <button
          className={styles.secondaryAction}
          disabled={disabled}
          onClick={onBeginRename}
          type="button"
        >
          Rename section
        </button>
        <button
          className={styles.secondaryAction}
          disabled={disabled || index === 0}
          onClick={() => onMove(-1)}
          type="button"
        >
          Move section up
        </button>
        <button
          className={styles.secondaryAction}
          disabled={disabled || index === sectionCount - 1}
          onClick={() => onMove(1)}
          type="button"
        >
          Move section down
        </button>
        <button
          className={styles.dangerAction}
          disabled={disabled || sectionCount <= 1 || deleteActive}
          onClick={onBeginDelete}
          type="button"
        >
          Delete section
        </button>
      </div>
    </header>
  );
}

function InlineNameForm({
  label,
  onCancel,
  onSubmit,
  pending,
  setValue,
  value,
}: {
  label: string;
  onCancel: () => void;
  onSubmit: () => void;
  pending: boolean;
  setValue: (value: string) => void;
  value: string;
}) {
  return (
    <div className={styles.inlineNameForm}>
      <label>
        {label}
        <input maxLength={80} onChange={(event) => setValue(event.target.value)} value={value} />
      </label>
      <button
        className={styles.primaryAction}
        disabled={pending || !value.trim()}
        onClick={onSubmit}
        type="button"
      >
        Save
      </button>
      <button
        className={styles.secondaryAction}
        disabled={pending}
        onClick={onCancel}
        type="button"
      >
        Cancel
      </button>
    </div>
  );
}
