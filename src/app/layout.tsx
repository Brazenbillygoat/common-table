import type { Metadata } from "next";

import { MobileNavigation } from "@/components/navigation/MobileNavigation";
import { SiteHeader } from "@/components/navigation/SiteHeader";
import navigationStyles from "@/components/navigation/navigation.module.scss";
import { getCurrentSession } from "@/server/auth/session";

import "@/styles/globals.scss";

export const metadata: Metadata = {
  applicationName: "Common Table",
  title: {
    default: "Common Table",
    template: "%s | Common Table",
  },
  description: "A personal cookbook for finding recipes and planning meals.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Common Table",
  },
  formatDetection: {
    telephone: false,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getCurrentSession();
  // Only pass the display name to client-side navigation, not the full session.
  const viewer = session
    ? {
        displayName: session.user.name,
      }
    : null;

  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <SiteHeader viewer={viewer} />
        <div className={navigationStyles.appFrame}>{children}</div>
        <MobileNavigation />
      </body>
    </html>
  );
}
