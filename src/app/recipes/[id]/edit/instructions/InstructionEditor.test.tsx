import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecipeStepEditorData } from "@/utils/recipe-step";

import { InstructionEditor } from "./InstructionEditor";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

const firstId = "e785b35e-4ff4-421b-9609-58b889461279";
const secondId = "c62ec57a-7ef4-470c-ae03-10a74b8aabf2";
const emptyData: RecipeStepEditorData = {
  recipe: { id: "34053bb6-c957-4d2d-a621-b2e34b774a1d", title: "Chili", version: 1 },
  steps: [],
};
const populatedData: RecipeStepEditorData = {
  ...emptyData,
  steps: [
    { id: firstId, position: 0, instruction: "Stir gently.\nKeep warm." },
    { id: secondId, position: 1, instruction: "Serve." },
  ],
};

function response(status: number, payload: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("InstructionEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows exact empty-state copy and focuses the textarea when Add step opens", async () => {
    render(<InstructionEditor data={emptyData} />);
    expect(screen.getByText("Draft saved")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No instructions yet" })).toBeInTheDocument();
    expect(screen.getByText("Add the first step for this recipe.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    const textarea = screen.getByRole("textbox", { name: "Instruction" });
    await waitFor(() => expect(textarea).toHaveFocus());
    expect(textarea).toHaveAttribute("maxlength", "2000");
  });

  it("preserves invalid text and focuses a linked validation summary", async () => {
    render(<InstructionEditor data={emptyData} />);
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    const textarea = screen.getByRole("textbox", { name: "Instruction" });
    fireEvent.change(textarea, { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    const summary = await screen.findByRole("alert");
    await waitFor(() => expect(summary).toHaveFocus());
    const errorLink = screen.getByRole("link", { name: "Enter an instruction." });
    expect(errorLink).toHaveAttribute("href", "#instruction");
    expect(textarea).toHaveValue(" ");
    fireEvent.click(errorLink);
    expect(textarea).toHaveFocus();
  });

  it("rejects overlength text without sending a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<InstructionEditor data={emptyData} />);
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    const textarea = screen.getByRole("textbox", { name: "Instruction" });
    fireEvent.change(textarea, { target: { value: "x".repeat(2_001) } });
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    expect(
      await screen.findByRole("link", {
        name: "Instruction must be 2,000 characters or fewer.",
      }),
    ).toHaveAttribute("href", "#instruction");
    expect(textarea).toHaveValue("x".repeat(2_001));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adds only after success and sends the replacement version next", async () => {
    let resolveFirst: ((value: Response) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(new Promise<Response>((resolve) => (resolveFirst = resolve)))
      .mockImplementationOnce(() =>
        response(201, {
          data: {
            step: { id: secondId, position: 1, instruction: "Serve." },
            version: 3,
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <InstructionEditor data={{ ...emptyData, recipe: { ...emptyData.recipe, version: 1 } }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Instruction" }), {
      target: { value: " Stir. " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    fireEvent.submit(screen.getByRole("textbox", { name: "Instruction" }).closest("form")!);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFirst!(
      new Response(
        JSON.stringify({
          data: { step: { id: firstId, position: 0, instruction: "Stir." }, version: 2 },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    await waitFor(() => expect(screen.getByText("Instruction saved.")).toBeInTheDocument());
    expect(screen.getByRole("listitem")).toHaveTextContent("Stir.");
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Instruction" }), {
      target: { value: "Serve." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      expectedVersion: 2,
      instruction: "Serve.",
    });
  });

  it("updates a step only after a successful response", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      response(200, {
        data: {
          step: { id: firstId, position: 0, instruction: "Simmer gently." },
          version: 2,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<InstructionEditor data={populatedData} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    const textarea = screen.getByRole("textbox", { name: "Instruction" });
    fireEvent.change(textarea, { target: { value: " Simmer gently. " } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByText("Instruction saved.")).toBeInTheDocument());
    expect(screen.getByText("Simmer gently.")).toBeInTheDocument();
    expect(
      screen.queryByText((_, element) => element?.textContent === "Stir gently.\nKeep warm."),
    ).not.toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      expectedVersion: 1,
      instruction: " Simmer gently. ",
    });
  });

  it("supports edit cancel, multiline plain text, and inline delete cancel", async () => {
    render(<InstructionEditor data={populatedData} />);
    expect(
      screen.getByText((_, element) => element?.textContent === "Stir gently.\nKeep warm."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Move up" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Move up" })[1]).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "Move down" })[0]).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "Move down" })[1]).toBeDisabled();
    const editButtons = screen.getAllByRole("button", { name: "Edit" });
    fireEvent.click(editButtons[0]);
    const textarea = screen.getByRole("textbox", { name: "Instruction" });
    expect(textarea).toHaveValue("Stir gently.\nKeep warm.");
    fireEvent.change(textarea, { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox", { name: "Instruction" })).not.toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.textContent === "Stir gently.\nKeep warm."),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Edit" })[0]).toHaveFocus());
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    expect(screen.getByText("Delete step?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Delete step?")).not.toBeInTheDocument();
  });

  it("applies delete and reorder only after success and compacts step numbers", async () => {
    let resolveDelete: ((value: Response) => void) | undefined;
    let resolveOrder: ((value: Response) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(new Promise<Response>((resolve) => (resolveDelete = resolve)))
      .mockReturnValueOnce(new Promise<Response>((resolve) => (resolveOrder = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    const firstRender = render(<InstructionEditor data={populatedData} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[1]);
    expect(
      screen.getByText((_, element) => element?.textContent === "Stir gently.\nKeep warm."),
    ).toBeInTheDocument();
    resolveDelete!(
      new Response(
        JSON.stringify({ data: { deletedStepId: firstId, stepIds: [secondId], version: 2 } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByText((_, element) => element?.textContent === "Stir gently.\nKeep warm."),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Step 1")).toBeInTheDocument();

    // Render a fresh two-step editor to verify reorder waits for the server.
    firstRender.unmount();
    const { unmount } = render(<InstructionEditor data={populatedData} />);
    const serve = screen.getByText("Serve.");
    fireEvent.click(screen.getAllByRole("button", { name: "Move up" })[1]);
    expect(serve.closest("li")).toHaveTextContent("Step 2");
    resolveOrder!(
      new Response(JSON.stringify({ data: { stepIds: [secondId, firstId], version: 2 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await waitFor(() => expect(serve.closest("li")).toHaveTextContent("Step 1"));
    unmount();
  });

  it("preserves work for authentication, conflict, and generic failures", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => response(401, { error: { code: "AUTH_REQUIRED" } }))
      .mockImplementationOnce(() => response(409, { error: { code: "VERSION_CONFLICT" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<InstructionEditor data={emptyData} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add step" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Instruction" }), {
      target: { value: "Keep this" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    expect(
      await screen.findByRole("heading", {
        name: "Your session expired. Sign in again to continue.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Instruction" })).toHaveValue("Keep this");

    rerender(<InstructionEditor data={emptyData} />);
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    expect(
      await screen.findByRole("heading", { name: "This draft changed elsewhere." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add step" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reload draft" }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("preserves work and allows retry after a network failure", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementationOnce(() =>
        response(201, {
          data: { step: { id: firstId, position: 0, instruction: "Retry me" }, version: 2 },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<InstructionEditor data={emptyData} />);
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Instruction" }), {
      target: { value: "Retry me" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    expect(
      await screen.findByRole("heading", {
        name: "We couldn't save that instruction change.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Instruction" })).toHaveValue("Retry me");
    await waitFor(() => expect(screen.getByRole("button", { name: "Add step" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    await waitFor(() => expect(screen.getByText("Instruction saved.")).toBeInTheDocument());
    expect(screen.getByRole("listitem")).toHaveTextContent("Retry me");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
