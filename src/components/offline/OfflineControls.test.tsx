import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OfflineCollection, OfflineManifest } from "@/utils/offline-protocol";
import { OfflineControls } from "./OfflineControls";

const device = vi.hoisted(() => ({
  readCollection: vi.fn(),
  appIsReady: vi.fn(),
  offlineRegistration: vi.fn(),
  checkPublications: vi.fn(),
  appDownloadEstimate: vi.fn(),
  syncPublications: vi.fn(),
  removeOfflineDownloads: vi.fn(),
}));
vi.mock("@/offline/storage", () => ({ readCollection: device.readCollection }));
vi.mock("@/offline/client", () => ({
  ...device,
  RevisionConflict: class extends Error {},
  STORAGE_EVENT: "test-offline-storage",
}));

let revision = 0;
let manifest: OfflineManifest;
let saved: OfflineCollection;
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  manifest = { format: 1, revision: String(++revision).padStart(64, "0"), entries: [] };
  saved = { manifest, recipes: [], syncedAt: "2026-09-07T12:00:00.000Z", token: "saved-copy" };
  device.readCollection.mockResolvedValue(null);
  device.appIsReady.mockResolvedValue(false);
  device.offlineRegistration.mockResolvedValue(undefined);
  device.checkPublications.mockResolvedValue(manifest);
  device.appDownloadEstimate.mockResolvedValue(1024);
});
afterEach(() => vi.restoreAllMocks());

const button = (name: string) => screen.getByRole("button", { name });

describe("offline download controls", () => {
  it("separates checking from consent and does not call an empty device broken", async () => {
    render(<OfflineControls />);
    expect(screen.getByText("Checking saved downloads.")).toBeVisible();
    await screen.findByRole("button", { name: "Download now" });
    expect(screen.getByText("No offline download saved yet.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Check for updates" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove offline downloads" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("About offline downloads").closest("details")).not.toHaveAttribute(
      "open",
    );
    fireEvent.click(button("Later"));
    expect(screen.queryByText(/Saved recipes kept/)).not.toBeInTheDocument();
    fireEvent.click(button("Check for updates"));
    await screen.findByRole("button", { name: "Download now" });
    expect(device.syncPublications).not.toHaveBeenCalled();
    let finish!: () => void;
    device.syncPublications.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(button("Download now"));
    expect(screen.getByText("Downloading recipes and app files…")).toBeVisible();
    expect(button("Download now")).toBeDisabled();
    expect(device.syncPublications).toHaveBeenCalledExactlyOnceWith(manifest);
    device.readCollection.mockResolvedValue(saved);
    device.appIsReady.mockResolvedValue(true);
    await act(async () => finish());
    expect(screen.getByText(/Available offline/)).toBeVisible();
    expect(screen.getByText("Offline download complete.")).toBeVisible();
  });

  it("keeps a failed download retry on Download now without claiming a full device", async () => {
    device.syncPublications.mockRejectedValue(
      new Error("Offline app setup failed. Reload the page and try again."),
    );
    render(<OfflineControls />);
    fireEvent.click(await screen.findByRole("button", { name: "Download now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Offline app setup failed");
    expect(screen.getByRole("alert")).not.toHaveTextContent(/space|storage/i);
    expect(screen.getByText("Offline download needs to be completed.")).toBeVisible();
    expect(button("Download now")).toBeEnabled();
    expect(button("Remove offline downloads")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("focuses removal confirmation and makes the removed state neutral without an automatic redownload", async () => {
    device.readCollection.mockResolvedValue(saved);
    // A current recipe collection with missing app files also has a download offer.
    device.appIsReady.mockResolvedValue(false);
    render(<OfflineControls />);
    await screen.findByRole("button", { name: "Download now" });
    fireEvent.click(button("Remove offline downloads"));
    expect(screen.queryByRole("button", { name: "Download now" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check for updates" })).not.toBeInTheDocument();
    fireEvent.click(button("Cancel"));
    expect(button("Download now")).toBeVisible();
    expect(device.removeOfflineDownloads).not.toHaveBeenCalled();
    fireEvent.click(button("Remove offline downloads"));
    let finish!: () => void;
    device.removeOfflineDownloads.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(button("Confirm removal"));
    expect(screen.getByText("Removing offline downloads…")).toBeVisible();
    const checks = device.checkPublications.mock.calls.length;
    act(() => window.dispatchEvent(new Event("online")));
    expect(device.checkPublications).toHaveBeenCalledTimes(checks);
    device.readCollection.mockResolvedValue(null);
    await act(async () => finish());
    expect(screen.getByText("No offline download saved yet.")).toBeVisible();
    expect(screen.getByText("Offline downloads removed from this device.")).toBeVisible();
    expect(button("Check for updates")).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Remove offline downloads" }),
    ).not.toBeInTheDocument();
    expect(device.syncPublications).not.toHaveBeenCalled();
  });

  it("keeps removal available when saved storage cannot be read", async () => {
    device.readCollection.mockRejectedValue(new Error("Unreadable saved copy"));
    render(<OfflineControls />);
    await waitFor(() => expect(button("Remove offline downloads")).toBeEnabled());
    expect(screen.getByText("Offline availability could not be checked.")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Saved downloads could not be read");
    expect(device.checkPublications).not.toHaveBeenCalled();
  });
});
