import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PublicationControls } from "./PublicationControls";

const recipeId = "34053bb6-c957-4d2d-a621-b2e34b774a1d";
const draft = {
  version: 3,
  status: "draft" as const,
  sourceVersion: null,
  publishedAt: null,
  slug: "chili",
};
const published = {
  ...draft,
  status: "published" as const,
  sourceVersion: 3,
  publishedAt: "2026-09-04T18:00:00.000Z",
};
const fetchMock = vi.fn();

function response(publication: unknown) {
  return Response.json({ publication });
}

describe("PublicationControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("links missing saved requirements to their editors and disables publication", () => {
    render(
      <PublicationControls
        recipeId={recipeId}
        publication={draft}
        requirements={[
          { stage: "details", message: "Add a valid title." },
          { stage: "ingredients", message: "Add an ingredient." },
          { stage: "instructions", message: "Add an instruction." },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Add a valid title." })).toHaveAttribute(
      "href",
      `/recipes/${recipeId}/edit/details`,
    );
    expect(screen.getByRole("link", { name: "Add an ingredient." })).toHaveAttribute(
      "href",
      `/recipes/${recipeId}/edit/ingredients`,
    );
    expect(screen.getByRole("link", { name: "Add an instruction." })).toHaveAttribute(
      "href",
      `/recipes/${recipeId}/edit/instructions`,
    );
    expect(screen.getByText(/Publishing shares saved content/)).toBeInTheDocument();
  });

  it("publishes only the saved version, then shows the public link and current state", async () => {
    fetchMock.mockResolvedValue(response({ ...published, version: 4, sourceVersion: 4 }));
    render(<PublicationControls recipeId={recipeId} publication={draft} requirements={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await screen.findByText("Your saved recipe is now public.");
    expect(fetchMock).toHaveBeenCalledWith(`/api/recipes/${recipeId}/publication`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish", expectedVersion: 3 }),
    });
    expect(screen.getByText("Published · Up to date")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish updates" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "View public recipe" })).toHaveAttribute(
      "href",
      "/r/chili",
    );
  });

  it("identifies private changes and allows publishing updates", async () => {
    fetchMock.mockResolvedValue(response({ ...published, version: 5, sourceVersion: 5 }));
    render(
      <PublicationControls
        recipeId={recipeId}
        publication={{ ...published, version: 4 }}
        requirements={[]}
      />,
    );
    expect(screen.getByText("Published · Unpublished changes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish updates" }));
    await screen.findByText("Published · Up to date");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      action: "publish",
      expectedVersion: 4,
    });
  });

  it("prevents duplicate requests while publication is pending", async () => {
    let finish!: (value: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    render(<PublicationControls recipeId={recipeId} publication={draft} requirements={[]} />);
    const publish = screen.getByRole("button", { name: "Publish" });
    fireEvent.click(publish);
    fireEvent.click(publish);
    expect(publish).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledOnce();
    await act(async () => finish(response({ ...published, version: 4, sourceVersion: 4 })));
  });

  it("requires confirmation to unpublish, preserves saved content, and can republish", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<PublicationControls recipeId={recipeId} publication={published} requirements={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("People already cooking"));
    confirm.mockReturnValue(true);
    fetchMock.mockResolvedValueOnce(response({ ...draft, version: 4 }));
    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
    await screen.findByText("Recipe unpublished. Your saved content is still here.");
    expect(screen.queryByRole("link", { name: "View public recipe" })).not.toBeInTheDocument();
    expect(screen.getByText("Draft · Private")).toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(response({ ...published, version: 5, sourceVersion: 5 }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await screen.findByText("Your saved recipe is now public.");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      action: "publish",
      expectedVersion: 4,
    });
    expect(screen.getByRole("link", { name: "View public recipe" })).toHaveAttribute(
      "href",
      "/r/chili",
    );
  });

  it("handles even malformed conflict responses before parsing and requires an explicit reload", async () => {
    fetchMock.mockResolvedValue(new Response("not JSON", { status: 409 }));
    render(<PublicationControls recipeId={recipeId} publication={draft} requirements={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Reload saved recipe" })).toHaveAttribute(
      "href",
      `/recipes/${recipeId}/edit/preview`,
    );
    expect(screen.queryByText("Your saved recipe is now public.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("blocks publication when the preview and publication versions differ", () => {
    render(<PublicationControls recipeId={recipeId} publication={draft} requirements={[]} stale />);
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Reload saved recipe" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps unpublish available when private edits no longer meet publish requirements", () => {
    render(
      <PublicationControls
        recipeId={recipeId}
        publication={{ ...published, version: 4 }}
        requirements={[{ stage: "instructions", message: "Add an instruction." }]}
      />,
    );
    expect(screen.getByRole("button", { name: "Publish updates" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeEnabled();
  });

  it.each([401, 404, 422, 500])(
    "reports HTTP %s failures without claiming publication",
    async (status) => {
      fetchMock.mockResolvedValue(new Response("", { status }));
      render(<PublicationControls recipeId={recipeId} publication={draft} requirements={[]} />);
      fireEvent.click(screen.getByRole("button", { name: "Publish" }));
      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Draft · Private")).toBeInTheDocument();
      expect(screen.queryByText("Your saved recipe is now public.")).not.toBeInTheDocument();
      if (status === 401)
        expect(screen.getByRole("link", { name: "Sign in in a new tab" })).toHaveAttribute(
          "href",
          "/sign-in",
        );
    },
  );

  it.each(["network", "malformed", "unexpected-version"])(
    "requires reload after a %s failure whose outcome cannot be confirmed",
    async (failure) => {
      if (failure === "network") fetchMock.mockRejectedValue(new Error("offline"));
      else if (failure === "malformed")
        fetchMock.mockResolvedValue(Response.json({ publication: {} }));
      else fetchMock.mockResolvedValue(response({ ...published, version: 9, sourceVersion: 9 }));
      render(<PublicationControls recipeId={recipeId} publication={draft} requirements={[]} />);
      fireEvent.click(screen.getByRole("button", { name: "Publish" }));
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent("We couldn't confirm the change."),
      );
      expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
      expect(screen.getByText("Draft · Private")).toBeInTheDocument();
    },
  );
});
