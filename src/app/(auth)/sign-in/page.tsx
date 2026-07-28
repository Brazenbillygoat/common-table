import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentSession } from "@/server/auth/session";

import { SignInForm } from "./SignInForm";
import styles from "./sign-in.module.scss";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function SignInPage() {
  const session = await getCurrentSession();

  if (session) {
    redirect("/");
  }

  return (
    <main className={`${styles.page} page-shell`} id="main-content">
      <div className={styles.card}>
        <p className={styles.eyebrow}>Common Table</p>
        <h1>Sign in</h1>
        <p className={styles.introduction}>
          Use the account credentials provided by the administrator.
        </p>
        <SignInForm />
        <Link className={styles.backLink} href="/">
          Back to public recipes
        </Link>
      </div>
    </main>
  );
}
