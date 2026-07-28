import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StartRecipeForm } from "./StartRecipeForm";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

describe("StartRecipeForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders the exact fields and yield helper", () => {
    render(<StartRecipeForm />);
    expect(screen.getByLabelText("Recipe title")).toBeInTheDocument();
    expect(screen.getByText("Use the name your family will recognize.")).toBeInTheDocument();
    expect(screen.getByLabelText("Description (optional)")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Yield (optional)" })).toBeInTheDocument();
    expect(
      screen.getByText("Leave blank if the recipe does not have a fixed yield."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toHaveAttribute("step", "any");
  });

  it("hides the default yield unit placeholder while the field is focused", () => {
    render(<StartRecipeForm />);
    const unit = screen.getByLabelText("Unit") as HTMLInputElement;

    expect(unit).toHaveAttribute("placeholder", "servings");
    expect(unit).toHaveValue("");
    fireEvent.focus(unit);
    expect(unit).toHaveAttribute("placeholder", "");
    fireEvent.blur(unit);
    expect(unit).toHaveAttribute("placeholder", "servings");
  });

  it("adds a range, then removes it while preserving the starting amount", () => {
    render(<StartRecipeForm />);
    const amount = screen.getByLabelText("Amount");
    fireEvent.change(amount, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Add a range" }));
    expect(screen.getByLabelText("Ending amount")).toHaveAttribute("step", "any");
    fireEvent.change(screen.getByLabelText("Ending amount"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove range" }));

    expect(screen.getByLabelText("Amount")).toHaveValue(4);
    expect(screen.queryByLabelText("Ending amount")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add a range" }));
    expect(screen.getByLabelText("Ending amount")).toHaveValue(null);
  });

  it("allows Enter in the description without submitting", () => {
    render(<StartRecipeForm />);
    const description = screen.getByLabelText("Description (optional)");
    fireEvent.keyDown(description, { key: "Enter", code: "Enter" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows and focuses an accessible summary while preserving values", async () => {
    render(<StartRecipeForm />);
    const title = screen.getByLabelText("Recipe title");
    fireEvent.change(title, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Start recipe" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveFocus();
    expect(title).toHaveValue("   ");
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAttribute("aria-describedby", expect.stringContaining("error"));

    fireEvent.click(screen.getByRole("link", { name: "Enter a recipe title." }));
    expect(title).toHaveFocus();
  });

  it("prevents duplicate submission and navigates only after HTTP 201", async () => {
    let resolveRequest: ((value: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    render(<StartRecipeForm />);
    fireEvent.change(screen.getByLabelText("Recipe title"), {
      target: { value: "Family Chili" },
    });

    const form = document.getElementById("start-recipe-form") as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Starting recipe…" })).toBeDisabled();
      expect(form).toHaveAttribute("aria-busy", "true");
      expect(fetch).toHaveBeenCalledOnce();
    });

    fireEvent.submit(form);
    expect(fetch).toHaveBeenCalledOnce();
    expect(mocks.push).not.toHaveBeenCalled();

    resolveRequest?.(
      new Response(
        JSON.stringify({
          data: {
            editUrl: "/recipes/34053bb6-c957-4d2d-a621-b2e34b774a1d/edit/ingredients",
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith(
        "/recipes/34053bb6-c957-4d2d-a621-b2e34b774a1d/edit/ingredients",
      );
    });
  });

  it("preserves values and focuses the retry banner after a server failure", async () => {
    vi.mocked(fetch).mockResolvedValue({
      status: 500,
      json: async () => ({ error: { message: "database detail" } }),
    } as Response);
    render(<StartRecipeForm />);
    fireEvent.change(screen.getByLabelText("Recipe title"), {
      target: { value: "Family Chili" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start recipe" }));

    const heading = await screen.findByRole("heading", {
      name: "We couldn’t start this recipe.",
    });
    expect(heading.parentElement).toHaveFocus();
    expect(screen.getByText("Your work is still here. Try again.")).toBeInTheDocument();
    expect(screen.getByLabelText("Recipe title")).toHaveValue("Family Chili");
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("shows the session-expired response without redirecting or clearing values", async () => {
    vi.mocked(fetch).mockResolvedValue({
      status: 401,
      json: async () => ({
        error: { message: "Your session expired. Sign in again to continue." },
      }),
    } as Response);
    render(<StartRecipeForm />);
    fireEvent.change(screen.getByLabelText("Recipe title"), {
      target: { value: "Family Chili" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start recipe" }));

    expect(
      await screen.findByRole("heading", {
        name: "Your session expired. Sign in again to continue.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Recipe title")).toHaveValue("Family Chili");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
