import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "./config";

export async function getCurrentSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

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
