import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  createRecipeDraft: vi.fn(),
  getCurrentSession: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({
  getCurrentSession: mocks.getCurrentSession,
}));

vi.mock("@/server/recipes/create-recipe-draft", () => ({
  createRecipeDraft: mocks.createRecipeDraft,
}));

const body = {
  title: " Family Chili ",
  description: " ",
  yieldMin: "4",
  yieldMax: "",
  yieldUnit: " servings ",
};

function request(value: unknown = body) {
  return new Request("http://localhost/api/recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

describe("POST /api/recipes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a safe 400 for malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/recipes", { method: "POST", body: "{" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", fieldErrors: {} },
    });
  });

  it("returns exact field errors for invalid input", async () => {
    const response = await POST(request({ ...body, title: " " }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        fieldErrors: { title: ["Enter a recipe title."] },
      },
    });
  });

  it("returns JSON 401 and does not call the service without a session", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "AUTH_REQUIRED",
        message: "Your session expired. Sign in again to continue.",
      },
    });
    expect(mocks.createRecipeDraft).not.toHaveBeenCalled();
  });

  it("uses the authenticated user and returns only the safe result", async () => {
    mocks.getCurrentSession.mockResolvedValue({ user: { id: "trusted-user" } });
    const created = {
      id: "34053bb6-c957-4d2d-a621-b2e34b774a1d",
      title: "Family Chili",
      status: "draft",
      version: 1,
      editUrl: "/recipes/34053bb6-c957-4d2d-a621-b2e34b774a1d/edit/ingredients",
    };
    mocks.createRecipeDraft.mockResolvedValue(created);

    const response = await POST(request({ ...body, ownerId: "attacker" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: created });
    expect(mocks.createRecipeDraft).toHaveBeenCalledWith({
      actorUserId: "trusted-user",
      input: {
        title: "Family Chili",
        description: null,
        yieldMin: 4,
        yieldMax: null,
        yieldUnit: "servings",
      },
    });
  });

  it("maps unexpected failures to a generic 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getCurrentSession.mockResolvedValue({ user: { id: "trusted-user" } });
    mocks.createRecipeDraft.mockRejectedValue(new Error("private database detail"));
    const response = await POST(request());
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).toContain("We couldn’t start this recipe.");
    expect(text).not.toContain("private database detail");
    expect(text).not.toContain("trusted-user");
  });
});
