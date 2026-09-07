import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  UnsavedChangesProvider,
  useUnsavedChangesWarning,
} from "@/components/navigation/UnsavedChangesProvider";

import { SignOutButton } from "./SignOutButton";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));

vi.mock("@/components/auth/auth-client", () => ({
  authClient: { signOut: mocks.signOut },
}));

function DirtyForm() {
  useUnsavedChangesWarning(true);
  return <input aria-label="Entered title" defaultValue="Unsaved title" />;
}

function DirtyEditor() {
  return (
    <UnsavedChangesProvider>
      <DirtyForm />
      <SignOutButton />
    </UnsavedChangesProvider>
  );
}

describe("SignOutButton", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cancels before calling authentication and preserves the entered values", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DirtyEditor />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Entered title")).toHaveValue("Unsaved title");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });

  it("permits confirmed sign-out and routes home after authentication succeeds", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DirtyEditor />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
    expect(confirm).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it.each(["rejected response", "network failure"])(
    "preserves the warning after a %s",
    async (failure) => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(true).mockReturnValue(false);
      if (failure === "network failure") {
        mocks.signOut.mockRejectedValue(new Error("Network unavailable"));
      } else {
        mocks.signOut.mockResolvedValue({ error: { message: "Private authentication error" } });
      }
      render(<DirtyEditor />);

      fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
      expect(await screen.findByRole("status")).toHaveTextContent("Unable to sign out. Try again.");
      expect(screen.queryByText("Private authentication error")).not.toBeInTheDocument();
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Entered title")).toHaveValue("Unsaved title");

      fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
      expect(confirm).toHaveBeenCalledTimes(2);
      expect(mocks.signOut).toHaveBeenCalledOnce();
      const unload = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(unload);
      expect(unload.defaultPrevented).toBe(true);
    },
  );

  it("prevents duplicate requests while sign-out is pending", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let resolveSignOut: ((value: { error: null }) => void) | undefined;
    mocks.signOut.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSignOut = resolve;
        }),
    );
    render(<DirtyEditor />);
    const button = screen.getByRole("button", { name: "Sign out" });

    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Signing out…" })).toBeDisabled();

    await act(async () => resolveSignOut?.({ error: null }));
    expect(mocks.replace).toHaveBeenCalledWith("/");
  });

  it("preserves ordinary sign-out without an editor or provider", async () => {
    const confirm = vi.spyOn(window, "confirm");
    render(<SignOutButton />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
  });
});
