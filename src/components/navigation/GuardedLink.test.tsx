import { fireEvent, render, screen } from "@testing-library/react";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GuardedLink } from "./GuardedLink";
import { MobileNavigation } from "./MobileNavigation";
import { SiteHeader } from "./SiteHeader";
import { UnsavedChangesProvider, useUnsavedChangesWarning } from "./UnsavedChangesProvider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/auth/auth-client", () => ({
  authClient: { signOut: vi.fn() },
}));

const router: NextRouter = {
  route: "/",
  pathname: "/",
  query: {},
  asPath: "/",
  basePath: "",
  isLocaleDomain: false,
  isReady: true,
  isFallback: false,
  isPreview: false,
  back: vi.fn(),
  forward: vi.fn(),
  beforePopState: vi.fn(),
  push: vi.fn().mockResolvedValue(true),
  replace: vi.fn().mockResolvedValue(true),
  reload: vi.fn(),
  prefetch: vi.fn().mockResolvedValue(undefined),
  events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
};

function DirtyForm({ isDirty }: { isDirty: boolean }) {
  useUnsavedChangesWarning(isDirty);
  return <input aria-label="Entered title" defaultValue="Unsaved title" />;
}

function Harness({
  isDirty = true,
  showForm = true,
  children = <GuardedLink href="/recipes">Recipes</GuardedLink>,
}: {
  isDirty?: boolean;
  showForm?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <RouterContext.Provider value={router}>
      <UnsavedChangesProvider>
        {showForm ? <DirtyForm isDirty={isDirty} /> : null}
        {children}
      </UnsavedChangesProvider>
    </RouterContext.Provider>
  );
}

function unloadIsBlocked() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("unsaved-changes navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves normal navigation without unsaved edits", () => {
    const confirm = vi.spyOn(window, "confirm");
    render(<Harness isDirty={false} />);

    fireEvent.click(screen.getByRole("link", { name: "Recipes" }));

    expect(router.push).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
    expect(unloadIsBlocked()).toBe(false);
  });

  it("cancels departure and preserves entered values", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Harness />);

    fireEvent.click(screen.getByRole("link", { name: "Recipes" }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Entered title")).toHaveValue("Unsaved title");
    expect(unloadIsBlocked()).toBe(true);
  });

  it("permits confirmed departure but keeps guarding until the form actually leaves", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(true).mockReturnValue(false);
    render(<Harness />);

    fireEvent.click(screen.getByRole("link", { name: "Recipes" }));
    expect(router.push).toHaveBeenCalledOnce();
    expect(unloadIsBlocked()).toBe(true);

    fireEvent.click(screen.getByRole("link", { name: "Recipes" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(router.push).toHaveBeenCalledOnce();
  });

  it("clears the warning when edits are saved and when the editor unmounts", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { rerender } = render(<Harness />);
    expect(unloadIsBlocked()).toBe(true);

    rerender(<Harness isDirty={false} />);
    expect(unloadIsBlocked()).toBe(false);
    fireEvent.click(screen.getByRole("link", { name: "Recipes" }));
    expect(confirm).not.toHaveBeenCalled();

    rerender(<Harness />);
    expect(unloadIsBlocked()).toBe(true);
    rerender(<Harness showForm={false} />);
    expect(unloadIsBlocked()).toBe(false);
  });

  it("guards the brand, desktop navigation, sign-in link, and mobile navigation", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <Harness>
        <SiteHeader viewer={null} />
        <MobileNavigation />
      </Harness>,
    );

    const links = screen.getAllByRole("link");
    for (const link of links) {
      fireEvent.click(link);
    }

    expect(confirm).toHaveBeenCalledTimes(10);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("passes link props and the caller's navigation callback through", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onNavigate = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <Harness>
        <GuardedLink
          aria-label="Preview recipe"
          className="preview-link"
          href="/recipes/recipe-id/edit/preview"
          onNavigate={onNavigate}
          replace
        >
          Preview
        </GuardedLink>
      </Harness>,
    );

    const link = screen.getByRole("link", { name: "Preview recipe" });
    expect(link).toHaveClass("preview-link");
    expect(link).toHaveAttribute("href", "/recipes/recipe-id/edit/preview");
    fireEvent.click(link);

    expect(onNavigate).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("allows links rendered outside the provider", () => {
    const confirm = vi.spyOn(window, "confirm");
    render(
      <RouterContext.Provider value={router}>
        <GuardedLink href="/search">Search</GuardedLink>
      </RouterContext.Provider>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Search" }));

    expect(router.push).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
  });
});
