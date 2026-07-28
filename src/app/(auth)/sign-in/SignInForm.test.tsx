import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignInForm } from "./SignInForm";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  signInEmail: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));

vi.mock("@/components/auth/auth-client", () => ({
  authClient: {
    signIn: {
      email: mocks.signInEmail,
    },
  },
}));

describe("SignInForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates required email and password fields", async () => {
    render(<SignInForm />);

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Email is required.")).toBeInTheDocument();
    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(mocks.signInEmail).not.toHaveBeenCalled();
  });

  it("prevents duplicate submission while authentication is pending", async () => {
    let resolveSignIn: ((value: { data: object; error: null }) => void) | undefined;
    mocks.signInEmail.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve;
        }),
    );
    render(<SignInForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "cook@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct horse battery staple" },
    });

    const form = screen.getByRole("form", { name: "Sign in" });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
      expect(mocks.signInEmail).toHaveBeenCalledTimes(1);
    });

    fireEvent.submit(form);
    expect(mocks.signInEmail).toHaveBeenCalledTimes(1);

    resolveSignIn?.({ data: {}, error: null });

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/");
      expect(mocks.refresh).toHaveBeenCalledOnce();
    });
  });

  it("uses one generic authentication error and clears the password", async () => {
    mocks.signInEmail.mockResolvedValue({
      data: null,
      error: {
        message: "User was not found",
      },
    });
    render(<SignInForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "missing@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "not the right password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Unable to sign in with those credentials."),
    ).toBeInTheDocument();
    expect(screen.queryByText("User was not found")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("missing@example.com");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });
});
