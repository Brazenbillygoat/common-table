import { SignOutButton } from "@/components/auth/SignOutButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

import { GuardedLink } from "./GuardedLink";
import styles from "./navigation.module.scss";

type SiteHeaderProps = {
  viewer: {
    displayName: string;
  } | null;
};

const primaryLinks = [
  { href: "/", label: "Browse" },
  { href: "/meal-plans", label: "Meal Plan" },
  { href: "/recipes", label: "My Recipes" },
];

export function SiteHeader({ viewer }: SiteHeaderProps) {
  return (
    <header className={styles.siteHeader}>
      <div className={styles.headerContent}>
        <GuardedLink className={styles.brand} href="/">
          Common Table
        </GuardedLink>
        <nav aria-label="Primary navigation" className={styles.desktopNavigation}>
          {primaryLinks.map((link) => (
            <GuardedLink className={styles.navigationLink} href={link.href} key={link.href}>
              {link.label}
            </GuardedLink>
          ))}
        </nav>
        <div className={styles.account}>
          <ThemeToggle />
          {viewer ? (
            <>
              <span className={styles.displayName}>{viewer.displayName}</span>
              <SignOutButton />
            </>
          ) : (
            <GuardedLink className={styles.signInLink} href="/sign-in">
              Sign in
            </GuardedLink>
          )}
        </div>
      </div>
    </header>
  );
}
