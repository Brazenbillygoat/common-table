import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { getDatabase } from "@/server/db/client";
import {
  recipeIngredient,
  recipeIngredientChoiceGroup,
  recipeIngredientSection,
} from "@/server/db/schema";
import {
  normalizeRecipeIngredient,
  type RecipeIngredientStructureAction,
} from "@/utils/recipe-ingredient";

import {
  advanceRecipeVersion,
  loadLinkedSteps,
  RecipeIngredientError,
  validateIngredientReferences,
} from "./manage-recipe-ingredients";

interface MutationArguments {
  actorUserId: string;
  recipeId: string;
  expectedVersion: number;
  action: RecipeIngredientStructureAction;
}

type Transaction = Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0];

type StoredLine = {
  id: string;
  sectionId: string;
  choiceGroupId: string | null;
  position: number;
  isOptional: boolean;
};

type ItemUnit = { type: "ingredient" | "group"; id: string; lineIds: string[] };

export async function mutateRecipeIngredientStructure({
  actorUserId,
  recipeId,
  expectedVersion,
  action,
}: MutationArguments) {
  return getDatabase().transaction(async (transaction) => {
    const version = await advanceRecipeVersion(transaction, recipeId, actorUserId, expectedVersion);

    switch (action.type) {
      case "addSection":
        return { version, ...(await addSection(transaction, recipeId, action.name)) };
      case "renameSection":
        await renameSection(transaction, recipeId, action.sectionId, action.name);
        return { version };
      case "reorderSections":
        await reorderSections(transaction, recipeId, action.sectionIds);
        return { version, sectionIds: action.sectionIds };
      case "deleteSection":
        await deleteSection(transaction, recipeId, action);
        return { version };
      case "createGroup":
        return {
          version,
          ...(await createGroup(
            transaction,
            recipeId,
            action.ingredientId,
            action.label,
            action.option,
          )),
        };
      case "renameGroup":
        await renameGroup(transaction, recipeId, action.groupId, action.label);
        return { version };
      case "addGroupOption":
        return {
          version,
          ...(await addGroupOption(transaction, recipeId, action.groupId, action.option)),
        };
      case "reorderGroupOptions":
        await reorderGroupOptions(transaction, recipeId, action.groupId, action.optionIds);
        return { version, optionIds: action.optionIds };
      case "ungroup":
        await ungroup(transaction, recipeId, action.groupId);
        return { version };
      case "deleteGroup":
        await deleteGroup(transaction, recipeId, action.groupId);
        return { version };
      case "moveItem":
        await moveItem(transaction, recipeId, action);
        return { version };
    }
  });
}

async function addSection(transaction: Transaction, recipeId: string, rawName: string) {
  const sections = await loadSections(transaction, recipeId);
  if (sections.length === 0) throw new RecipeIngredientError("RECIPE_NOT_FOUND");
  if (sections.some((section) => section.name === null)) {
    throw new RecipeIngredientError("UNNAMED_SECTION_REQUIRES_NAME");
  }
  const name = rawName.trim();
  assertUniqueSectionName(sections, name);
  const [created] = await transaction
    .insert(recipeIngredientSection)
    .values({ recipeId, name, position: sections.length })
    .returning({ id: recipeIngredientSection.id });
  if (!created) throw new Error("Section insert did not return a row.");
  return { sectionId: created.id };
}

async function renameSection(
  transaction: Transaction,
  recipeId: string,
  sectionId: string,
  rawName: string,
) {
  const sections = await loadSections(transaction, recipeId);
  if (!sections.some((section) => section.id === sectionId)) {
    throw new RecipeIngredientError("SECTION_NOT_FOUND");
  }
  const name = rawName.trim();
  assertUniqueSectionName(
    sections.filter((section) => section.id !== sectionId),
    name,
  );
  await transaction
    .update(recipeIngredientSection)
    .set({ name })
    .where(
      and(
        eq(recipeIngredientSection.id, sectionId),
        eq(recipeIngredientSection.recipeId, recipeId),
      ),
    );
}

async function reorderSections(transaction: Transaction, recipeId: string, sectionIds: string[]) {
  const sections = await loadSections(transaction, recipeId);
  if (
    !sameIdSet(
      sections.map((section) => section.id),
      sectionIds,
    )
  ) {
    throw new RecipeIngredientError("STRUCTURE_INVALID");
  }
  const offset = sections.length * 2 + 1;
  await transaction
    .update(recipeIngredientSection)
    .set({ position: sql`${recipeIngredientSection.position} + ${offset}` })
    .where(eq(recipeIngredientSection.recipeId, recipeId));
  for (const [position, id] of sectionIds.entries()) {
    await transaction
      .update(recipeIngredientSection)
      .set({ position })
      .where(
        and(eq(recipeIngredientSection.id, id), eq(recipeIngredientSection.recipeId, recipeId)),
      );
  }
}

async function deleteSection(
  transaction: Transaction,
  recipeId: string,
  action: Extract<RecipeIngredientStructureAction, { type: "deleteSection" }>,
) {
  const sections = await loadSections(transaction, recipeId);
  const source = sections.find((section) => section.id === action.sectionId);
  if (!source) throw new RecipeIngredientError("SECTION_NOT_FOUND");
  if (sections.length <= 1) throw new RecipeIngredientError("LAST_SECTION");
  const sourceLines = (await loadLines(transaction, recipeId)).filter(
    (line) => line.sectionId === source.id,
  );

  if (action.disposition === "delete") {
    const linkedSteps = await loadLinkedSteps(
      transaction,
      recipeId,
      sourceLines.map((line) => line.id),
    );
    if (linkedSteps.length > 0) {
      throw new RecipeIngredientError("CONTENT_REFERENCED", { linkedSteps });
    }
    if (sourceLines.length > 0) {
      await transaction
        .delete(recipeIngredient)
        .where(
          and(eq(recipeIngredient.recipeId, recipeId), eq(recipeIngredient.sectionId, source.id)),
        );
    }
    await transaction
      .delete(recipeIngredientChoiceGroup)
      .where(
        and(
          eq(recipeIngredientChoiceGroup.recipeId, recipeId),
          eq(recipeIngredientChoiceGroup.sectionId, source.id),
        ),
      );
  } else {
    if (!action.targetSectionId || action.targetSectionId === source.id) {
      throw new RecipeIngredientError("STRUCTURE_INVALID");
    }
    const target = sections.find((section) => section.id === action.targetSectionId);
    if (!target) throw new RecipeIngredientError("SECTION_NOT_FOUND");
    await moveAllSectionLines(transaction, recipeId, source.id, target.id, sourceLines);
  }

  await transaction
    .delete(recipeIngredientSection)
    .where(
      and(
        eq(recipeIngredientSection.id, source.id),
        eq(recipeIngredientSection.recipeId, recipeId),
      ),
    );
  await reorderSections(
    transaction,
    recipeId,
    sections.filter((section) => section.id !== source.id).map((section) => section.id),
  );
}

async function createGroup(
  transaction: Transaction,
  recipeId: string,
  ingredientId: string,
  rawLabel: string,
  rawOption: Extract<RecipeIngredientStructureAction, { type: "createGroup" }>["option"],
) {
  const [base] = await transaction
    .select({
      id: recipeIngredient.id,
      sectionId: recipeIngredient.sectionId,
      choiceGroupId: recipeIngredient.choiceGroupId,
      position: recipeIngredient.position,
      isOptional: recipeIngredient.isOptional,
    })
    .from(recipeIngredient)
    .where(and(eq(recipeIngredient.id, ingredientId), eq(recipeIngredient.recipeId, recipeId)))
    .limit(1);
  if (!base) throw new RecipeIngredientError("RECIPE_NOT_FOUND");
  if (base.choiceGroupId) throw new RecipeIngredientError("STRUCTURE_INVALID");
  const linkedSteps = await loadLinkedSteps(transaction, recipeId, [base.id]);
  if (linkedSteps.length > 0) {
    throw new RecipeIngredientError("CONTENT_REFERENCED", { linkedSteps });
  }
  if (rawOption.isOptional) throw new RecipeIngredientError("GROUP_OPTION_OPTIONAL");
  const option = normalizeRecipeIngredient(rawOption);
  await validateIngredientReferences(transaction, option);

  const [group] = await transaction
    .insert(recipeIngredientChoiceGroup)
    .values({ recipeId, sectionId: base.sectionId, label: rawLabel.trim() })
    .returning({ id: recipeIngredientChoiceGroup.id });
  if (!group) throw new Error("Alternative group insert did not return a row.");

  await transaction
    .update(recipeIngredient)
    .set({ choiceGroupId: group.id, isOptional: false })
    .where(and(eq(recipeIngredient.id, base.id), eq(recipeIngredient.recipeId, recipeId)));
  const sectionLines = (await loadLines(transaction, recipeId)).filter(
    (line) => line.sectionId === base.sectionId,
  );
  const maximum = sectionLines.reduce((value, line) => Math.max(value, line.position), -1);
  const [created] = await transaction
    .insert(recipeIngredient)
    .values({
      recipeId,
      sectionId: base.sectionId,
      choiceGroupId: group.id,
      position: maximum + 1,
      ...option,
      isOptional: false,
    })
    .returning({ id: recipeIngredient.id });
  if (!created) throw new Error("Alternative option insert did not return a row.");

  const desired = sectionLines.map((line) => line.id);
  const baseIndex = desired.indexOf(base.id);
  desired.splice(baseIndex + 1, 0, created.id);
  await setSectionLineOrder(transaction, recipeId, base.sectionId, desired);
  return { groupId: group.id, optionId: created.id };
}

async function renameGroup(
  transaction: Transaction,
  recipeId: string,
  groupId: string,
  rawLabel: string,
) {
  const [updated] = await transaction
    .update(recipeIngredientChoiceGroup)
    .set({ label: rawLabel.trim() })
    .where(
      and(
        eq(recipeIngredientChoiceGroup.id, groupId),
        eq(recipeIngredientChoiceGroup.recipeId, recipeId),
      ),
    )
    .returning({ id: recipeIngredientChoiceGroup.id });
  if (!updated) throw new RecipeIngredientError("GROUP_NOT_FOUND");
}

async function addGroupOption(
  transaction: Transaction,
  recipeId: string,
  groupId: string,
  rawOption: Extract<RecipeIngredientStructureAction, { type: "addGroupOption" }>["option"],
) {
  if (rawOption.isOptional) throw new RecipeIngredientError("GROUP_OPTION_OPTIONAL");
  const group = await loadGroup(transaction, recipeId, groupId);
  const option = normalizeRecipeIngredient(rawOption);
  await validateIngredientReferences(transaction, option);
  const sectionLines = (await loadLines(transaction, recipeId)).filter(
    (line) => line.sectionId === group.sectionId,
  );
  const groupLines = sectionLines.filter((line) => line.choiceGroupId === group.id);
  if (groupLines.length < 2) throw new RecipeIngredientError("STRUCTURE_INVALID");
  const maximum = sectionLines.reduce((value, line) => Math.max(value, line.position), -1);
  const [created] = await transaction
    .insert(recipeIngredient)
    .values({
      recipeId,
      sectionId: group.sectionId,
      choiceGroupId: group.id,
      position: maximum + 1,
      ...option,
      isOptional: false,
    })
    .returning({ id: recipeIngredient.id });
  if (!created) throw new Error("Alternative option insert did not return a row.");
  const desired = sectionLines.map((line) => line.id);
  const lastGroupIndex = Math.max(...groupLines.map((line) => desired.indexOf(line.id)));
  desired.splice(lastGroupIndex + 1, 0, created.id);
  await setSectionLineOrder(transaction, recipeId, group.sectionId, desired);
  return { optionId: created.id };
}

async function reorderGroupOptions(
  transaction: Transaction,
  recipeId: string,
  groupId: string,
  optionIds: string[],
) {
  const group = await loadGroup(transaction, recipeId, groupId);
  const sectionLines = (await loadLines(transaction, recipeId)).filter(
    (line) => line.sectionId === group.sectionId,
  );
  const current = sectionLines.filter((line) => line.choiceGroupId === group.id);
  if (
    !sameIdSet(
      current.map((line) => line.id),
      optionIds,
    ) ||
    optionIds.length < 2
  ) {
    throw new RecipeIngredientError("STRUCTURE_INVALID");
  }
  const optionSet = new Set(optionIds);
  const firstIndex = sectionLines.findIndex((line) => optionSet.has(line.id));
  const desired = sectionLines.filter((line) => !optionSet.has(line.id)).map((line) => line.id);
  desired.splice(firstIndex, 0, ...optionIds);
  await setSectionLineOrder(transaction, recipeId, group.sectionId, desired);
}

async function ungroup(transaction: Transaction, recipeId: string, groupId: string) {
  const group = await loadGroup(transaction, recipeId, groupId);
  const options = (await loadLines(transaction, recipeId)).filter(
    (line) => line.choiceGroupId === group.id,
  );
  if (options.length < 2) throw new RecipeIngredientError("STRUCTURE_INVALID");
  const linkedSteps = await loadLinkedSteps(
    transaction,
    recipeId,
    options.map((option) => option.id),
  );
  if (linkedSteps.length > 0) {
    throw new RecipeIngredientError("CONTENT_REFERENCED", { linkedSteps });
  }
  await transaction
    .update(recipeIngredient)
    .set({ choiceGroupId: null })
    .where(
      and(eq(recipeIngredient.recipeId, recipeId), eq(recipeIngredient.choiceGroupId, group.id)),
    );
  await transaction
    .delete(recipeIngredientChoiceGroup)
    .where(
      and(
        eq(recipeIngredientChoiceGroup.id, group.id),
        eq(recipeIngredientChoiceGroup.recipeId, recipeId),
      ),
    );
}

async function deleteGroup(transaction: Transaction, recipeId: string, groupId: string) {
  const group = await loadGroup(transaction, recipeId, groupId);
  const sectionLines = (await loadLines(transaction, recipeId)).filter(
    (line) => line.sectionId === group.sectionId,
  );
  const options = sectionLines.filter((line) => line.choiceGroupId === group.id);
  const linkedSteps = await loadLinkedSteps(
    transaction,
    recipeId,
    options.map((option) => option.id),
  );
  if (linkedSteps.length > 0) {
    throw new RecipeIngredientError("CONTENT_REFERENCED", { linkedSteps });
  }
  await transaction
    .delete(recipeIngredient)
    .where(
      and(eq(recipeIngredient.recipeId, recipeId), eq(recipeIngredient.choiceGroupId, group.id)),
    );
  await transaction
    .delete(recipeIngredientChoiceGroup)
    .where(
      and(
        eq(recipeIngredientChoiceGroup.id, group.id),
        eq(recipeIngredientChoiceGroup.recipeId, recipeId),
      ),
    );
  await setSectionLineOrder(
    transaction,
    recipeId,
    group.sectionId,
    sectionLines.filter((line) => line.choiceGroupId !== group.id).map((line) => line.id),
  );
}

async function moveItem(
  transaction: Transaction,
  recipeId: string,
  action: Extract<RecipeIngredientStructureAction, { type: "moveItem" }>,
) {
  const sections = await loadSections(transaction, recipeId);
  if (!sections.some((section) => section.id === action.targetSectionId)) {
    throw new RecipeIngredientError("SECTION_NOT_FOUND");
  }
  const lines = await loadLines(transaction, recipeId);
  let moving: StoredLine[];
  if (action.itemType === "group") {
    const group = await loadGroup(transaction, recipeId, action.itemId);
    moving = lines.filter((line) => line.choiceGroupId === group.id);
  } else {
    const line = lines.find((item) => item.id === action.itemId);
    if (!line) throw new RecipeIngredientError("RECIPE_NOT_FOUND");
    if (line.choiceGroupId) throw new RecipeIngredientError("STRUCTURE_INVALID");
    moving = [line];
  }
  if (moving.length === 0) throw new RecipeIngredientError("STRUCTURE_INVALID");
  const sourceSectionId = moving[0].sectionId;
  if (moving.some((line) => line.sectionId !== sourceSectionId)) {
    throw new RecipeIngredientError("STRUCTURE_INVALID");
  }
  const movingIds = moving.map((line) => line.id);
  const movingSet = new Set(movingIds);

  if (sourceSectionId === action.targetSectionId) {
    const units = sectionUnits(lines.filter((line) => line.sectionId === sourceSectionId));
    const currentIndex = units.findIndex(
      (unit) => unit.type === action.itemType && unit.id === action.itemId,
    );
    if (currentIndex < 0) throw new RecipeIngredientError("STRUCTURE_INVALID");
    const [unit] = units.splice(currentIndex, 1);
    if (action.targetIndex > units.length) throw new RecipeIngredientError("STRUCTURE_INVALID");
    units.splice(action.targetIndex, 0, unit);
    await setSectionLineOrder(
      transaction,
      recipeId,
      sourceSectionId,
      units.flatMap((item) => item.lineIds),
    );
    return;
  }

  const sourceRemaining = lines.filter(
    (line) => line.sectionId === sourceSectionId && !movingSet.has(line.id),
  );
  const targetLines = lines.filter((line) => line.sectionId === action.targetSectionId);
  const targetUnits = sectionUnits(targetLines);
  if (action.targetIndex > targetUnits.length) throw new RecipeIngredientError("STRUCTURE_INVALID");

  const maximum = lines.reduce((value, line) => Math.max(value, line.position), -1);
  const temporaryBase = maximum + lines.length + 100;
  for (const [offset, line] of moving.entries()) {
    await transaction
      .update(recipeIngredient)
      .set({ position: temporaryBase + offset })
      .where(and(eq(recipeIngredient.id, line.id), eq(recipeIngredient.recipeId, recipeId)));
  }
  const groupId = action.itemType === "group" ? action.itemId : null;
  if (groupId) {
    await transaction
      .update(recipeIngredient)
      .set({ choiceGroupId: null })
      .where(and(eq(recipeIngredient.recipeId, recipeId), inArray(recipeIngredient.id, movingIds)));
    await transaction
      .update(recipeIngredientChoiceGroup)
      .set({ sectionId: action.targetSectionId })
      .where(
        and(
          eq(recipeIngredientChoiceGroup.id, groupId),
          eq(recipeIngredientChoiceGroup.recipeId, recipeId),
        ),
      );
  }
  for (const line of moving) {
    await transaction
      .update(recipeIngredient)
      .set({ sectionId: action.targetSectionId, choiceGroupId: groupId })
      .where(and(eq(recipeIngredient.id, line.id), eq(recipeIngredient.recipeId, recipeId)));
  }

  await setSectionLineOrder(
    transaction,
    recipeId,
    sourceSectionId,
    sourceRemaining.map((line) => line.id),
  );
  targetUnits.splice(action.targetIndex, 0, {
    type: action.itemType,
    id: action.itemId,
    lineIds: movingIds,
  });
  await setSectionLineOrder(
    transaction,
    recipeId,
    action.targetSectionId,
    targetUnits.flatMap((unit) => unit.lineIds),
  );
}

async function moveAllSectionLines(
  transaction: Transaction,
  recipeId: string,
  sourceSectionId: string,
  targetSectionId: string,
  sourceLines: StoredLine[],
) {
  if (sourceLines.length === 0) return;
  const targetLines = (await loadLines(transaction, recipeId)).filter(
    (line) => line.sectionId === targetSectionId,
  );
  const groupIds = [
    ...new Set(sourceLines.map((line) => line.choiceGroupId).filter((id): id is string => !!id)),
  ];
  const sourceIds = sourceLines.map((line) => line.id);
  if (groupIds.length > 0) {
    await transaction
      .update(recipeIngredient)
      .set({ choiceGroupId: null })
      .where(and(eq(recipeIngredient.recipeId, recipeId), inArray(recipeIngredient.id, sourceIds)));
    await transaction
      .update(recipeIngredientChoiceGroup)
      .set({ sectionId: targetSectionId })
      .where(
        and(
          eq(recipeIngredientChoiceGroup.recipeId, recipeId),
          inArray(recipeIngredientChoiceGroup.id, groupIds),
        ),
      );
  }
  const maximum = [...targetLines, ...sourceLines].reduce(
    (value, line) => Math.max(value, line.position),
    -1,
  );
  const temporaryBase = maximum + targetLines.length + sourceLines.length + 1;
  for (const [offset, line] of sourceLines.entries()) {
    await transaction
      .update(recipeIngredient)
      .set({
        sectionId: targetSectionId,
        position: temporaryBase + offset,
        choiceGroupId: line.choiceGroupId,
      })
      .where(and(eq(recipeIngredient.id, line.id), eq(recipeIngredient.recipeId, recipeId)));
  }
  await setSectionLineOrder(transaction, recipeId, targetSectionId, [
    ...targetLines.map((line) => line.id),
    ...sourceIds,
  ]);
}

async function setSectionLineOrder(
  transaction: Transaction,
  recipeId: string,
  sectionId: string,
  lineIds: string[],
) {
  const current = await transaction
    .select({ id: recipeIngredient.id, position: recipeIngredient.position })
    .from(recipeIngredient)
    .where(and(eq(recipeIngredient.recipeId, recipeId), eq(recipeIngredient.sectionId, sectionId)))
    .orderBy(asc(recipeIngredient.position));
  if (
    !sameIdSet(
      current.map((line) => line.id),
      lineIds,
    )
  ) {
    throw new RecipeIngredientError("STRUCTURE_INVALID");
  }
  if (current.length === 0) return;
  const maximum = Math.max(...current.map((line) => line.position));
  const offset = maximum + current.length + 1;
  await transaction
    .update(recipeIngredient)
    .set({ position: sql`${recipeIngredient.position} + ${offset}` })
    .where(and(eq(recipeIngredient.recipeId, recipeId), eq(recipeIngredient.sectionId, sectionId)));
  for (const [position, id] of lineIds.entries()) {
    await transaction
      .update(recipeIngredient)
      .set({ position })
      .where(
        and(
          eq(recipeIngredient.id, id),
          eq(recipeIngredient.recipeId, recipeId),
          eq(recipeIngredient.sectionId, sectionId),
        ),
      );
  }
}

async function loadSections(transaction: Transaction, recipeId: string) {
  return transaction
    .select({
      id: recipeIngredientSection.id,
      name: recipeIngredientSection.name,
      position: recipeIngredientSection.position,
    })
    .from(recipeIngredientSection)
    .where(eq(recipeIngredientSection.recipeId, recipeId))
    .orderBy(asc(recipeIngredientSection.position));
}

async function loadLines(transaction: Transaction, recipeId: string): Promise<StoredLine[]> {
  return transaction
    .select({
      id: recipeIngredient.id,
      sectionId: recipeIngredient.sectionId,
      choiceGroupId: recipeIngredient.choiceGroupId,
      position: recipeIngredient.position,
      isOptional: recipeIngredient.isOptional,
    })
    .from(recipeIngredient)
    .where(eq(recipeIngredient.recipeId, recipeId))
    .orderBy(asc(recipeIngredient.sectionId), asc(recipeIngredient.position));
}

async function loadGroup(transaction: Transaction, recipeId: string, groupId: string) {
  const [group] = await transaction
    .select({
      id: recipeIngredientChoiceGroup.id,
      sectionId: recipeIngredientChoiceGroup.sectionId,
    })
    .from(recipeIngredientChoiceGroup)
    .where(
      and(
        eq(recipeIngredientChoiceGroup.id, groupId),
        eq(recipeIngredientChoiceGroup.recipeId, recipeId),
      ),
    )
    .limit(1);
  if (!group) throw new RecipeIngredientError("GROUP_NOT_FOUND");
  return group;
}

function sectionUnits(lines: StoredLine[]): ItemUnit[] {
  const units: ItemUnit[] = [];
  const seenGroups = new Set<string>();
  for (const line of [...lines].sort((left, right) => left.position - right.position)) {
    if (!line.choiceGroupId) {
      units.push({ type: "ingredient", id: line.id, lineIds: [line.id] });
      continue;
    }
    const prior = units.at(-1);
    if (prior?.type === "group" && prior.id === line.choiceGroupId) {
      prior.lineIds.push(line.id);
      continue;
    }
    if (seenGroups.has(line.choiceGroupId)) {
      throw new RecipeIngredientError("STRUCTURE_INVALID");
    }
    seenGroups.add(line.choiceGroupId);
    units.push({ type: "group", id: line.choiceGroupId, lineIds: [line.id] });
  }
  if (units.some((unit) => unit.type === "group" && unit.lineIds.length < 2)) {
    throw new RecipeIngredientError("STRUCTURE_INVALID");
  }
  return units;
}

function assertUniqueSectionName(sections: { name: string | null }[], name: string) {
  const normalized = name.toLocaleLowerCase();
  if (sections.some((section) => section.name?.trim().toLocaleLowerCase() === normalized)) {
    throw new RecipeIngredientError("DUPLICATE_SECTION");
  }
}

function sameIdSet(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.every((id) => right.includes(id))
  );
}
