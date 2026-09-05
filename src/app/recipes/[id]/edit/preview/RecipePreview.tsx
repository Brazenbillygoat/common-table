"use client";

import { RecipeCookingContent } from "@/components/recipes/RecipeCookingContent";
import type { RecipeAlternativeContent } from "@/utils/recipe-alternatives";

export function RecipePreview({ content }: { content: RecipeAlternativeContent }) {
  return (
    <RecipeCookingContent
      content={content}
      emptyChoicesMessage="This draft has no ingredient choices yet."
    />
  );
}
