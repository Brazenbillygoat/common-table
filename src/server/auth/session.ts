import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "./config";

// This reads request headers, so it has to stay on the server.
export async function getCurrentSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

// Pages redirect anonymous users, while API routes use getCurrentSession() so they can return JSON errors.
export async function requireUser() {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/sign-in");
  }

  return session;
}

export async function requireAdmin() {
  const session = await requireUser();

  if (!session.user.role?.split(",").includes("admin")) {
    redirect("/");
  }

  return session;
}
