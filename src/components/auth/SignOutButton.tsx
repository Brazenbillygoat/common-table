"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "./auth-client";
import styles from "./auth-controls.module.scss";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSignOut() {
    if (isPending) {
      return;
    }

    setIsPending(true);
    setErrorMessage(null);

    try {
      const result = await authClient.signOut();

      if (result.error) {
        setErrorMessage("Unable to sign out. Try again.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setErrorMessage("Unable to sign out. Try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className={styles.control}>
      <button className={styles.button} disabled={isPending} onClick={handleSignOut} type="button">
        {isPending ? "Signing out…" : "Sign out"}
      </button>
      {errorMessage ? (
        <p className={styles.error} role="status">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
