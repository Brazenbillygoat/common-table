import Link from "next/link";

import { SignOutButton } from "@/components/auth/SignOutButton";

import styles from "./navigation.module.scss";

type SiteHeaderProps = {
  viewer: {
    displayName: string;
  } | null;
};

const primaryLinks = [
  { href: "/", label: "Browse" },
  { href: "/search", label: "Search" },
  { href: "/meal-plans", label: "Meal Plan" },
  { href: "/recipes", label: "My Recipes" },
];

export function SiteHeader({ viewer }: SiteHeaderProps) {
  return (
    <header className={styles.siteHeader}>
      <div className={styles.headerContent}>
        <Link className={styles.brand} href="/">
          Common Table
        </Link>
        <nav aria-label="Primary navigation" className={styles.desktopNavigation}>
          {primaryLinks.map((link) => (
            <Link className={styles.navigationLink} href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className={styles.account}>
          {viewer ? (
            <>
              <span className={styles.displayName}>{viewer.displayName}</span>
              <SignOutButton />
            </>
          ) : (
            <Link className={styles.signInLink} href="/sign-in">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
