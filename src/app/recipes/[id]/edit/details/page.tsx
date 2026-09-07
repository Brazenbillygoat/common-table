import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/server/auth/session";
import { getOwnedRecipeDetails } from "@/server/recipes/get-owned-recipe-details";

import { DetailsEditor } from "./DetailsEditor";
import styles from "./details.module.scss";

export const metadata: Metadata = { title: "Recipe Details" };

export default async function DetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const recipe = await getOwnedRecipeDetails(id, session.user.id);
  if (!recipe) notFound();
  return (
    <main className={`${styles.page} page-shell`} id="main-content">
      <DetailsEditor recipe={recipe} key={recipe.id} />
    </main>
  );
}
