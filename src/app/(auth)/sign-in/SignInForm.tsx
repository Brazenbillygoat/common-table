"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { authClient } from "@/components/auth/auth-client";

import styles from "./sign-in.module.scss";

const signInSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

type SignInValues = z.infer<typeof signInSchema>;

const authenticationErrorMessage = "Unable to sign in with those credentials.";

export function SignInForm() {
  const router = useRouter();
  const {
    clearErrors,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    resetField,
    setError,
  } = useForm<SignInValues>({
    defaultValues: {
      email: "",
      password: "",
    },
    resolver: zodResolver(signInSchema),
  });

  async function onSubmit(values: SignInValues) {
    clearErrors("root");

    try {
      const result = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });

      if (result.error) {
        resetField("password");
        setError("root", {
          message: authenticationErrorMessage,
          type: "server",
        });
        return;
      }

      router.replace("/");
      // Refresh so Server Components that read the new session cookie render again.
      router.refresh();
    } catch {
      resetField("password");
      setError("root", {
        message: authenticationErrorMessage,
        type: "server",
      });
    }
  }

  const submitForm = handleSubmit(onSubmit);

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    if (isSubmitting) {
      event.preventDefault();
      return;
    }

    void submitForm(event);
  }

  const emailErrorId = errors.email ? "sign-in-email-error" : undefined;
  const passwordErrorId = errors.password ? "sign-in-password-error" : undefined;
  const formErrorId = errors.root?.message ? "sign-in-form-error" : undefined;

  return (
    <form
      aria-describedby={formErrorId}
      aria-label="Sign in"
      className={styles.form}
      noValidate
      onSubmit={handleFormSubmit}
    >
      <div className={styles.field}>
        <label htmlFor="sign-in-email">Email</label>
        <input
          aria-describedby={emailErrorId}
          aria-invalid={Boolean(errors.email)}
          autoComplete="email"
          id="sign-in-email"
          inputMode="email"
          type="email"
          {...register("email")}
        />
        {errors.email ? (
          <p className={styles.error} id="sign-in-email-error" role="alert">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label htmlFor="sign-in-password">Password</label>
        <input
          aria-describedby={passwordErrorId}
          aria-invalid={Boolean(errors.password)}
          autoComplete="current-password"
          id="sign-in-password"
          type="password"
          {...register("password")}
        />
        {errors.password ? (
          <p className={styles.error} id="sign-in-password-error" role="alert">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      {errors.root?.message ? (
        <p className={styles.formError} id="sign-in-form-error" role="alert">
          {errors.root.message}
        </p>
      ) : null}

      <button className={styles.submitButton} disabled={isSubmitting} type="submit">
        {isSubmitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
