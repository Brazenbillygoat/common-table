import type { Metadata } from "next";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
