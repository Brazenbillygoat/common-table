import Link from "next/link";

import styles from "./navigation.module.scss";

const navigationLinks = [
  { href: "/", label: "Browse" },
  { href: "/search", label: "Search" },
  { href: "/meal-plans", label: "Meal Plan" },
  { href: "/recipes", label: "Recipes" },
];

export function MobileNavigation() {
  return (
    <nav aria-label="Mobile navigation" className={styles.mobileNavigation}>
      {navigationLinks.map((link) => (
        <Link className={styles.mobileNavigationLink} href={link.href} key={link.href}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
