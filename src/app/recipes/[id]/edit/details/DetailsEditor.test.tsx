import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnsavedChangesProvider } from "@/components/navigation/UnsavedChangesProvider";
import type { OwnedRecipeDetails } from "@/utils/recipe-details";

import { DetailsEditor } from "./DetailsEditor";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

const recipe: OwnedRecipeDetails = {
  id: "34053bb6-c957-4d2d-a621-b2e34b774a1d",
  title: "Family chili",
  description: "A family favorite.",
  yieldMin: 2,
  yieldMax: null,
  yieldUnit: "bowls",
  version: 3,
};
const response = (status: number, data: unknown = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function editor(data = recipe) {
  return (
    <UnsavedChangesProvider>
      <DetailsEditor recipe={data} />
    </UnsavedChangesProvider>
  );
}
function changeTitle(value = "New chili") {
  fireEvent.change(screen.getByLabelText("Recipe title"), { target: { value } });
}
function submit() {
  fireEvent.submit(document.getElementById("recipe-details-form")!);
}
function unloadPrevented() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("DetailsEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(window, "confirm").mockReturnValue(false);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    { yieldMin: null, yieldMax: null, amount: "", range: false },
    { yieldMin: 2, yieldMax: null, amount: "2", range: false },
    { yieldMin: 2.5, yieldMax: 4, amount: "2.5", range: true },
  ])("loads persisted yield $yieldMin to $yieldMax", ({ yieldMin, yieldMax, amount, range }) => {
    render(editor({ ...recipe, yieldMin, yieldMax }));
    expect(screen.getByLabelText("Recipe title")).toHaveValue(recipe.title);
    expect(screen.getByLabelText("Description (optional)")).toHaveValue(recipe.description);
    expect(screen.getByLabelText(range ? "Starting amount" : "Amount")).toHaveValue(amount);
    expect(screen.getByLabelText("Unit")).toHaveValue("bowls");
    expect(screen.getByRole("link", { name: "Details" })).toHaveAttribute("aria-current", "page");
    if (range) expect(screen.getByLabelText("Ending amount")).toHaveValue("4");
    else expect(screen.queryByLabelText("Ending amount")).not.toBeInTheDocument();
    expect(unloadPrevented()).toBe(false);
  });

  it("saves normalized details, updates the heading and version, and clears the warning", async () => {
    const saved = {
      ...recipe,
      title: "New chili",
      description: null,
      yieldMin: 4,
      yieldMax: 6,
      version: 4,
    };
    vi.mocked(fetch).mockResolvedValue(response(200, { recipe: saved }));
    render(editor());
    changeTitle("  New chili  ");
    fireEvent.change(screen.getByLabelText("Description (optional)"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Add a range" }));
    fireEvent.change(screen.getByLabelText("Ending amount"), { target: { value: "6" } });
    expect(unloadPrevented()).toBe(true);
    submit();
    await screen.findByText("Details saved.");
    expect(screen.getByLabelText("Recipe title")).toHaveValue("New chili");
    expect(screen.getByText("New chili", { selector: "p" })).toBeInTheDocument();
    await waitFor(() => expect(unloadPrevented()).toBe(false));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      `/api/recipes/${recipe.id}/details`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          title: "New chili",
          description: "",
          yieldMin: "4",
          yieldMax: "6",
          yieldUnit: "bowls",
          expectedVersion: 3,
        }),
      }),
    );
    changeTitle("Next title");
    vi.mocked(fetch).mockResolvedValue(
      response(200, { recipe: { ...saved, title: "Next title", version: 5 } }),
    );
    submit();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).expectedVersion).toBe(4);
    await screen.findByText("Details saved.");
  });

  it("clears a removed range and supports omitted yield without changing other input", async () => {
    render(editor({ ...recipe, yieldMax: 4 }));
    fireEvent.click(screen.getByRole("button", { name: "Remove range" }));
    expect(screen.getByLabelText("Amount")).toHaveValue("2");
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "" } });
    vi.mocked(fetch).mockResolvedValue(
      response(200, { recipe: { ...recipe, yieldMin: null, yieldMax: null, version: 4 } }),
    );
    submit();
    await screen.findByText("Details saved.");
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body).toMatchObject({
      yieldMin: "",
      yieldMax: "",
      yieldUnit: "bowls",
      title: recipe.title,
    });
  });

  it("preserves invalid input and focuses an accessible error summary", async () => {
    render(editor());
    changeTitle("   ");
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1/2" } });
    submit();
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByLabelText("Recipe title")).toHaveValue("   ");
    expect(screen.getByLabelText("Amount")).toHaveValue("1/2");
    expect(screen.getByLabelText("Amount")).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("link", { name: "Enter a recipe title." }));
    expect(screen.getByLabelText("Recipe title")).toHaveFocus();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([400, 401, 404, 500, 0, 200])(
    "preserves edits and allows retry after failure %s",
    async (status) => {
      if (status === 0) vi.mocked(fetch).mockRejectedValue(new Error("Network failure"));
      else vi.mocked(fetch).mockResolvedValue(response(status));
      render(editor());
      changeTitle();
      submit();
      await screen.findByRole("alert");
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Save details" })).toBeEnabled(),
      );
      expect(screen.getByLabelText("Recipe title")).toHaveValue("New chili");
      expect(unloadPrevented()).toBe(true);
      expect(mocks.refresh).not.toHaveBeenCalled();
      if (status === 401)
        expect(screen.getByRole("link", { name: "Sign in in a new tab" })).toHaveAttribute(
          "target",
          "_blank",
        );
    },
  );

  it("prevents simultaneous submissions and protects input while a save is pending", async () => {
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(editor());
    changeTitle();
    submit();
    submit();
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Recipe title")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    await act(async () => finish(response(500)));
    expect(screen.getByLabelText("Recipe title")).toHaveValue("New chili");
  });

  it("locks conflicting saves until a confirmed successful reload, preserving input on cancellation and reload failure", async () => {
    vi.mocked(fetch).mockResolvedValue(response(409));
    render(editor());
    changeTitle();
    submit();
    const reload = await screen.findByRole("button", { name: "Reload latest draft" });
    expect(screen.getByRole("button", { name: "Save details" })).toBeDisabled();
    changeTitle("Still my input");
    submit();
    expect(fetch).toHaveBeenCalledOnce();
    fireEvent.click(reload);
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("discards your unsaved input"),
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Recipe title")).toHaveValue("Still my input");
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue(response(500));
    fireEvent.click(reload);
    await screen.findByText(
      "We couldn’t complete the request. Your work is still here. Try again.",
    );
    expect(screen.getByRole("button", { name: "Save details" })).toBeDisabled();
    expect(screen.getByLabelText("Recipe title")).toHaveValue("Still my input");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reload latest draft" })).toBeEnabled(),
    );
    vi.mocked(fetch).mockResolvedValue(
      response(200, { recipe: { ...recipe, title: "Other tab", version: 7 } }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload latest draft" }));
    await waitFor(() => expect(screen.getByLabelText("Recipe title")).toHaveValue("Other tab"));
    expect(screen.getByRole("button", { name: "Save details" })).toBeEnabled();
    expect(unloadPrevented()).toBe(false);
    expect(fetch).toHaveBeenLastCalledWith(`/api/recipes/${recipe.id}/details`, {
      cache: "no-store",
    });
    changeTitle("After reload");
    vi.mocked(fetch).mockResolvedValue(response(500));
    submit();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    expect(JSON.parse(vi.mocked(fetch).mock.calls[3][1]!.body as string).expectedVersion).toBe(7);
    await screen.findByRole("alert");
  });

  it("preserves unsaved input across background server refresh and clears warnings after revert or unmount", () => {
    const view = render(editor());
    changeTitle();
    view.rerender(editor({ ...recipe, title: "Background value", version: 9 }));
    expect(screen.getByLabelText("Recipe title")).toHaveValue("New chili");
    expect(unloadPrevented()).toBe(true);
    changeTitle(recipe.title);
    expect(unloadPrevented()).toBe(false);
    changeTitle();
    view.unmount();
    expect(unloadPrevented()).toBe(false);
  });
});
