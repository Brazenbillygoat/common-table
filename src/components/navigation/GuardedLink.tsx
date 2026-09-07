"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { useUnsavedChanges } from "./UnsavedChangesProvider";

export function GuardedLink({ onNavigate, ...props }: ComponentProps<typeof Link>) {
  const { confirmDeparture } = useUnsavedChanges();

  return (
    <Link
      {...props}
      onNavigate={(event) => {
        if (!confirmDeparture()) {
          event.preventDefault();
          return;
        }

        onNavigate?.(event);
      }}
    />
  );
}
