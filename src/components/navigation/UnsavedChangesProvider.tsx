"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";

type UnsavedChangesContextValue = {
  confirmDeparture: () => boolean;
  registerDirtyForm: () => () => void;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue>({
  confirmDeparture: () => true,
  registerDirtyForm: () => () => {},
});

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const dirtyForms = useRef(new Set<symbol>());

  const warnBeforeUnload = useCallback((event: BeforeUnloadEvent) => {
    event.preventDefault();
    // Older browsers also require returnValue; the browser chooses the warning text.
    event.returnValue = "";
  }, []);

  const registerDirtyForm = useCallback(() => {
    const registration = Symbol();
    const registrations = dirtyForms.current;
    registrations.add(registration);

    if (registrations.size === 1) {
      window.addEventListener("beforeunload", warnBeforeUnload);
    }

    return () => {
      registrations.delete(registration);

      if (registrations.size === 0) {
        window.removeEventListener("beforeunload", warnBeforeUnload);
      }
    };
  }, [warnBeforeUnload]);

  const confirmDeparture = useCallback(() => {
    // Permission to leave is not a save: a failed navigation or sign-out must stay guarded.
    return (
      dirtyForms.current.size === 0 || window.confirm("You have unsaved changes. Leave anyway?")
    );
  }, []);

  const value = useMemo(
    () => ({ confirmDeparture, registerDirtyForm }),
    [confirmDeparture, registerDirtyForm],
  );

  return <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>;
}

export function useUnsavedChanges() {
  return useContext(UnsavedChangesContext);
}

export function useUnsavedChangesWarning(isDirty: boolean) {
  const { registerDirtyForm } = useUnsavedChanges();

  useEffect(() => {
    if (isDirty) {
      // Saving and unmounting both release this form's registration.
      return registerDirtyForm();
    }
  }, [isDirty, registerDirtyForm]);
}
