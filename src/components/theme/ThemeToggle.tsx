"use client";

import { useEffect, useRef, useState } from "react";

import styles from "@/components/navigation/navigation.module.scss";

type Theme = "light" | "dark";

const storageKey = "common-table-theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);
  const explicitTheme = useRef<Theme | null>(null);

  useEffect(() => {
    let mounted = true;
    const mediaQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    let storedTheme: Theme | null = null;

    try {
      const storedValue = window.localStorage.getItem(storageKey);
      if (storedValue === "light" || storedValue === "dark") {
        storedTheme = storedValue;
      }
    } catch {
      storedTheme = null;
    }

    explicitTheme.current = storedTheme;
    if (storedTheme) {
      document.documentElement.dataset.theme = storedTheme;
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    const resolvedTheme = storedTheme ?? (mediaQuery?.matches ? "dark" : "light");
    queueMicrotask(() => {
      if (mounted) setTheme(resolvedTheme);
    });

    function handleSystemThemeChange(event: MediaQueryListEvent) {
      if (explicitTheme.current === null) {
        setTheme(event.matches ? "dark" : "light");
      }
    }

    mediaQuery?.addEventListener("change", handleSystemThemeChange);
    return () => {
      mounted = false;
      mediaQuery?.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  function toggleTheme() {
    if (theme === null) return;

    const nextTheme = theme === "light" ? "dark" : "light";
    explicitTheme.current = nextTheme;
    document.documentElement.dataset.theme = nextTheme;
    setTheme(nextTheme);
    try {
      window.localStorage.setItem(storageKey, nextTheme);
    } catch {
      // The theme still applies for this page when storage is unavailable.
    }
  }

  const isDark = theme === "dark";
  const label =
    theme === null
      ? "Theme preference loading"
      : isDark
        ? "Switch to light mode"
        : "Switch to dark mode";

  return (
    <button
      aria-label={label}
      className={styles.themeToggle}
      data-loading={theme === null ? "true" : undefined}
      disabled={theme === null}
      onClick={toggleTheme}
      type="button"
    >
      <span
        aria-hidden="true"
        className={styles.themeIcon}
        data-theme-icon={isDark ? "sun" : "moon"}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </span>
    </button>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path
        d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <circle cx="12" cy="12" fill="none" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}
