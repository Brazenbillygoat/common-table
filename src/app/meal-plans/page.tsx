import type { Metadata } from "next";

import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Meal Plan",
};

export default async function MealPlansPage() {
  await requireUser();

  return (
    <main className="page-shell" id="main-content">
      <p>Private meal planning</p>
      <h1>Your meal plan</h1>
      <p>Meal planning is not implemented yet. This private route confirms the account boundary.</p>
    </main>
  );
}
