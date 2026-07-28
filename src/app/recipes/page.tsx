import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/server/auth/session";
import { listOwnedRecipeDrafts } from "@/server/recipes/list-owned-recipe-drafts";

import styles from "./my-recipes.module.scss";

export const metadata: Metadata = {
  title: "My Recipes",
};

export default async function MyRecipesPage() {
  const session = await requireUser();
  const drafts = await listOwnedRecipeDrafts(session.user.id);

  return (
    <main className={`${styles.page} page-shell`} id="main-content">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Recipe workspace</p>
          <h1>My recipes</h1>
          <p>Continue a draft or start something new.</p>
        </div>
        <Link className={styles.primaryAction} href="/recipes/new">
          Start a recipe
        </Link>
      </header>
      {drafts.length === 0 ? (
        <section className={styles.emptyState}>
          <h2>No recipe drafts yet</h2>
          <p>Start a recipe when you’re ready to add one.</p>
        </section>
      ) : (
        <ul className={styles.draftList}>
          {drafts.map((draft) => (
            <li className={styles.draft} key={draft.id}>
              <div>
                <p className={styles.draftStatus}>Draft</p>
                <h2>{draft.title}</h2>
                <p>
                  Updated{" "}
                  <time dateTime={draft.updatedAt.toISOString()}>
                    {draft.updatedAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </time>
                </p>
              </div>
              <Link href={`/recipes/${draft.id}/edit/ingredients`}>Continue ingredients</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
