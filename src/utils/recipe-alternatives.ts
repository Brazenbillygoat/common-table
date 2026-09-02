import type {
  RecipeIngredientChoiceGroup,
  RecipeIngredientLine,
  RecipeIngredientSection,
} from "./recipe-ingredient";
import type { RecipeStep } from "./recipe-step";

export type RecipeBranchState = "active" | "inactive" | "unresolved";

export interface RecipeAlternativeContent {
  sections: RecipeIngredientSection[];
  choiceGroups: RecipeIngredientChoiceGroup[];
  ingredients: RecipeIngredientLine[];
  steps: RecipeStep[];
}

export interface RecipeSelectionInput {
  choiceOptionIds: string[];
  optionalIngredientIds: string[];
}

export interface ResolvedRecipeAlternatives {
  ingredients: Array<RecipeIngredientLine & { state: RecipeBranchState }>;
  steps: Array<RecipeStep & { state: RecipeBranchState; activeNumber: number | null }>;
  selectedChoiceByGroup: Record<string, string>;
  selectedOptionalIngredientIds: string[];
  invalidSelectionIds: string[];
}

export function resolveRecipeAlternatives(
  content: RecipeAlternativeContent,
  selection: RecipeSelectionInput,
): ResolvedRecipeAlternatives {
  const groupedOptions = content.ingredients.filter((line) => line.choiceGroupId);
  const optionById = new Map(groupedOptions.map((line) => [line.id, line]));
  const optionalIds = new Set(
    content.ingredients
      .filter((line) => !line.choiceGroupId && line.isOptional)
      .map((line) => line.id),
  );
  const invalid = new Set<string>();
  const requestedByGroup = new Map<string, Set<string>>();

  for (const id of new Set(selection.choiceOptionIds)) {
    const option = optionById.get(id);
    if (!option?.choiceGroupId) {
      invalid.add(id);
      continue;
    }
    const requested = requestedByGroup.get(option.choiceGroupId) ?? new Set<string>();
    requested.add(id);
    requestedByGroup.set(option.choiceGroupId, requested);
  }

  const selectedChoiceByGroup: Record<string, string> = {};
  for (const [groupId, requested] of requestedByGroup) {
    if (requested.size === 1) {
      selectedChoiceByGroup[groupId] = [...requested][0];
    } else {
      for (const id of requested) invalid.add(id);
    }
  }

  const selectedOptionalIngredientIds = [...new Set(selection.optionalIngredientIds)].filter(
    (id) => {
      if (optionalIds.has(id)) return true;
      invalid.add(id);
      return false;
    },
  );
  const selectedOptional = new Set(selectedOptionalIngredientIds);

  const ingredients = content.ingredients.map((line) => {
    let state: RecipeBranchState = "active";
    if (line.choiceGroupId) {
      const selectedId = selectedChoiceByGroup[line.choiceGroupId];
      state =
        selectedId === undefined ? "unresolved" : selectedId === line.id ? "active" : "inactive";
    } else if (line.isOptional) {
      state = selectedOptional.has(line.id) ? "active" : "inactive";
    }
    return { ...line, state };
  });
  const ingredientsById = new Map(ingredients.map((line) => [line.id, line]));

  let activeNumber = 0;
  const steps = content.steps.map((step) => {
    let state: RecipeBranchState = "active";
    if (step.conditionKind && step.conditionIngredientId) {
      const conditionIngredient = ingredientsById.get(step.conditionIngredientId);
      if (!conditionIngredient) {
        state = "unresolved";
      } else if (step.conditionKind === "choice_option") {
        state = conditionIngredient.choiceGroupId ? conditionIngredient.state : "unresolved";
      } else {
        state =
          !conditionIngredient.choiceGroupId && conditionIngredient.isOptional
            ? conditionIngredient.state
            : "unresolved";
      }
    } else if (step.conditionKind || step.conditionIngredientId) {
      state = "unresolved";
    }
    if (state === "active") activeNumber += 1;
    return { ...step, state, activeNumber: state === "active" ? activeNumber : null };
  });

  return {
    ingredients,
    steps,
    selectedChoiceByGroup,
    selectedOptionalIngredientIds,
    invalidSelectionIds: [...invalid],
  };
}

export function recipeSelectionFromQuery(query: {
  choice?: string | string[];
  optional?: string | string[];
}): RecipeSelectionInput {
  return {
    choiceOptionIds: queryValues(query.choice),
    optionalIngredientIds: queryValues(query.optional),
  };
}

function queryValues(value: string | string[] | undefined) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
