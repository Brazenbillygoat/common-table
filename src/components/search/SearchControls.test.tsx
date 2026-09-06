import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Link from "next/link";
import { SearchControls } from "./SearchControls";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
const advance = (milliseconds: number) => act(() => vi.advanceTimersByTime(milliseconds));
const lastUrl = () => new URL(navigation.push.mock.calls.at(-1)![0], "https://example.invalid");
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("automatic recipe search controls", () => {
  it("applies typing after 500 ms idle and resets the timer on later keystrokes", () => {
    render(<SearchControls parameters={{}} />);
    change("Search recipes", "bea");
    advance(499);
    expect(navigation.push).not.toHaveBeenCalled();
    change("Search recipes", "beans");
    advance(499);
    expect(navigation.push).not.toHaveBeenCalled();
    advance(1);
    expect(navigation.push).toHaveBeenCalledTimes(1);
    expect(lastUrl().searchParams.get("q")).toBe("beans");
    expect(navigation.push.mock.calls[0][1]).toEqual({ scroll: false });
  });

  it("uses one timer for all text fields and submits their complete latest values without page", () => {
    render(<SearchControls parameters={{ q: "stew", include: "tofu", page: "3" }} />);
    change("Search recipes", "beans");
    advance(300);
    change("Include ingredients", "chicken, tofu");
    advance(300);
    change("Exclude ingredients", "butter");
    advance(499);
    expect(navigation.push).not.toHaveBeenCalled();
    advance(1);
    expect(navigation.push).toHaveBeenCalledTimes(1);
    expect(lastUrl().searchParams.get("q")).toBe("beans");
    expect(lastUrl().searchParams.get("include")).toBe("chicken, tofu");
    expect(lastUrl().searchParams.get("exclude")).toBe("butter");
    expect(lastUrl().searchParams.has("page")).toBe(false);
  });

  it.each(["Search recipes", "Include ingredients", "Exclude ingredients"])(
    "clearing %s applies immediately and cancels pending typing",
    (label) => {
      render(<SearchControls parameters={{ q: "stew", include: "tofu", exclude: "butter" }} />);
      change("Search recipes", "beans");
      change(label, "");
      expect(navigation.push).toHaveBeenCalledTimes(1);
      const key =
        label === "Search recipes" ? "q" : label === "Include ingredients" ? "include" : "exclude";
      expect(lastUrl().searchParams.has(key)).toBe(false);
      advance(1000);
      expect(navigation.push).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["include", "exclude"] as const)(
    "removes an %s pill immediately while preserving all other draft fields",
    (kind) => {
      render(<SearchControls parameters={{ include: "chicken,tofu", exclude: "butter,oil" }} />);
      change("Search recipes", "stew");
      fireEvent.click(
        screen.getByRole("button", {
          name: kind === "include" ? "Remove include chicken" : "Remove exclude butter",
        }),
      );
      expect(navigation.push).toHaveBeenCalledTimes(1);
      expect(lastUrl().searchParams.get(kind)).toBe(kind === "include" ? "tofu" : "oil");
      expect(lastUrl().searchParams.get("q")).toBe("stew");
      expect(
        screen.getByLabelText(kind === "include" ? "Include ingredients" : "Exclude ingredients"),
      ).toHaveFocus();
      advance(500);
      expect(navigation.push).toHaveBeenCalledTimes(1);
    },
  );

  it("clears all search state and applies sort changes immediately", () => {
    render(
      <SearchControls parameters={{ q: "stew", include: "tofu", sort: "relevance", page: "2" }} />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "newest" } });
    expect(lastUrl().searchParams.get("sort")).toBe("newest");
    fireEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));
    expect(navigation.push).toHaveBeenLastCalledWith("/", { scroll: false });
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByLabelText("Include ingredients")).toHaveValue("");
  });

  it("flushes Enter/Search without native submission, duplicate requests or losing focus/caret", () => {
    const view = render(<SearchControls parameters={{}} />);
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    input.focus();
    change("Search recipes", "beans");
    input.setSelectionRange(2, 4);
    const submit = createEvent.submit(screen.getByRole("search"));
    fireEvent(screen.getByRole("search"), submit);
    expect(submit.defaultPrevented).toBe(true);
    expect(navigation.push).toHaveBeenCalledTimes(1);
    expect(input).toHaveFocus();
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 4]);
    view.rerender(<SearchControls parameters={{ q: "beans", sort: "newest" }} />);
    expect(screen.getByRole("searchbox")).toBe(input);
    expect(input).toHaveFocus();
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 4]);
    advance(500);
    expect(navigation.push).toHaveBeenCalledTimes(1);
  });

  it("preserves newer unsent input and its selection when an older server search completes", () => {
    const view = render(<SearchControls parameters={{}} />);
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    input.focus();
    change("Search recipes", "be");
    advance(500);
    change("Search recipes", "beans ");
    input.setSelectionRange(2, 3);
    view.rerender(<SearchControls parameters={{ q: "be", sort: "newest" }} />);
    expect(input).toHaveValue("beans ");
    expect(input).toHaveFocus();
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 3]);
    advance(500);
    expect(lastUrl().searchParams.get("q")).toBe("beans ");
  });

  it("keeps the latest draft across acknowledgements of overlapping requests", () => {
    const view = render(<SearchControls parameters={{}} />);
    change("Search recipes", "beans");
    advance(500);
    change("Search recipes", "tofu");
    advance(500);
    view.rerender(<SearchControls parameters={{ q: "beans", sort: "newest" }} />);
    expect(screen.getByRole("searchbox")).toHaveValue("tofu");
    view.rerender(<SearchControls parameters={{ q: "tofu", sort: "newest" }} />);
    expect(screen.getByRole("searchbox")).toHaveValue("tofu");
  });

  it("supersedes a pending request when clearing back to the currently committed URL", () => {
    const view = render(<SearchControls parameters={{}} />);
    change("Search recipes", "tofu");
    advance(500);
    change("Search recipes", "");
    expect(navigation.push).toHaveBeenLastCalledWith("/", { scroll: false });
    expect(navigation.refresh).not.toHaveBeenCalled();
    view.rerender(<SearchControls parameters={{}} />);
    fireEvent.submit(screen.getByRole("search"));
    expect(navigation.push).toHaveBeenLastCalledWith("/", { scroll: false });
    expect(navigation.push).toHaveBeenCalledTimes(3);
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it("cancels queued typing immediately on Back and restores every URL field", () => {
    render(<SearchControls parameters={{ q: "stew", sort: "newest" }} />);
    change("Search recipes", "pending");
    window.history.pushState(
      null,
      "",
      "/?q=beans&include=chicken&include=tofu&exclude=butter&sort=relevance&page=2",
    );
    fireEvent.popState(window);
    expect(screen.getByRole("searchbox")).toHaveValue("beans");
    expect(screen.getByLabelText("Include ingredients")).toHaveValue("chicken, tofu");
    expect(screen.getByLabelText("Exclude ingredients")).toHaveValue("butter");
    expect(screen.getByRole("combobox")).toHaveValue("relevance");
    advance(1000);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("restores external route values and cancels old typing without remounting the input", () => {
    const view = render(<SearchControls parameters={{ q: "stew" }} />);
    const input = screen.getByRole("searchbox");
    change("Search recipes", "pending");
    view.rerender(<SearchControls parameters={{ q: "soup", include: "beans", page: "2" }} />);
    expect(screen.getByRole("searchbox")).toBe(input);
    expect(input).toHaveValue("soup");
    expect(screen.getByLabelText("Include ingredients")).toHaveValue("beans");
    advance(1000);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("does not let a pending debounce interrupt opening a recipe", () => {
    render(
      <>
        <SearchControls parameters={{}} />
        <Link href="/r/stew" onClick={(event) => event.preventDefault()}>
          Open stew
        </Link>
      </>,
    );
    change("Search recipes", "beans");
    fireEvent.click(screen.getByRole("link", { name: "Open stew" }));
    advance(1000);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("cancels pending work on unmount", () => {
    const view = render(<SearchControls parameters={{}} />);
    change("Search recipes", "beans");
    view.unmount();
    advance(1000);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("restores the committed search when Browse targets the same URL as before typing", () => {
    const view = render(
      <>
        <SearchControls parameters={{}} />
        <Link href="/" onClick={(event) => event.preventDefault()}>
          Browse
        </Link>
      </>,
    );
    change("Search recipes", "beans");
    fireEvent.click(screen.getByRole("link", { name: "Browse" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    view.rerender(
      <>
        <SearchControls parameters={{}} />
        <Link href="/" onClick={(event) => event.preventDefault()}>
          Browse
        </Link>
      </>,
    );
    expect(screen.getByRole("searchbox")).toHaveValue("");
    advance(1000);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("supersedes a slow Browse navigation when resubmitting the previous search", () => {
    render(
      <>
        <SearchControls parameters={{ q: "beans", sort: "newest" }} />
        <Link href="/" onClick={(event) => event.preventDefault()}>
          Browse
        </Link>
      </>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Browse" }));
    change("Search recipes", "beans");
    fireEvent.submit(screen.getByRole("search"));
    expect(navigation.push).toHaveBeenLastCalledWith("/?q=beans&sort=newest", { scroll: false });
    expect(navigation.refresh).not.toHaveBeenCalled();
    advance(500);
    expect(navigation.push).toHaveBeenCalledOnce();
  });

  it("waits for composition to finish and ignores Enter used to choose an IME character", () => {
    render(<SearchControls parameters={{}} />);
    const input = screen.getByRole("searchbox");
    change("Search recipes", "b");
    fireEvent.compositionStart(input);
    change("Search recipes", "豆");
    advance(1000);
    const enter = createEvent.keyDown(input, { key: "Enter", keyCode: 229, isComposing: true });
    fireEvent(input, enter);
    expect(enter.defaultPrevented).toBe(true);
    fireEvent.submit(screen.getByRole("search"));
    expect(navigation.push).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input, { data: "豆" });
    advance(499);
    expect(navigation.push).not.toHaveBeenCalled();
    advance(1);
    expect(lastUrl().searchParams.get("q")).toBe("豆");
  });

  it("sends invalid draft filters for correction instead of silently broadening them", () => {
    render(<SearchControls parameters={{}} />);
    change("Exclude ingredients", "butter,,oil");
    advance(500);
    expect(lastUrl().searchParams.get("exclude")).toBe("butter,,oil");
  });

  it("keeps the visible matching explanation and makes submission optional", () => {
    render(<SearchControls parameters={{}} />);
    expect(screen.getByText(/Ingredient filters match text anywhere/)).toHaveTextContent(
      "'Butter' matches both 'salted butter' and 'peanut butter,' for inclusion and exclusion. Included ingredients may be alternatives.",
    );
    expect(screen.getByText(/Results update automatically/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute("type", "submit");
  });
});
