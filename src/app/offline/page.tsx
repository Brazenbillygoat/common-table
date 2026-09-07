import { Suspense } from "react";
import { OfflineShell } from "@/components/offline/OfflineShell";

// Next force-static supplies empty headers/cookies to the shared server layout.
// This build-time anonymous page is the ONLY HTML the worker may persist.
export const dynamic = "force-static";
export const metadata = { title: "Saved recipes", robots: { index: false, follow: false } };
export default function OfflinePage() {
  return (
    <Suspense
      fallback={
        <main className="page-shell" id="main-content">
          Opening saved recipes…
        </main>
      }
    >
      <OfflineShell />
    </Suspense>
  );
}
