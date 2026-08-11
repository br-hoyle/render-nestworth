"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-context";
import { api } from "./api";
import type { HouseholdSettings } from "./types";

export type ThemePreference = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "nw-theme-preference";

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolve(pref: ThemePreference): ResolvedTheme {
  if (pref === "light" || pref === "dark") return pref;
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function readCached(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // localStorage blocked — fall through to default.
  }
  return "system";
}

function applyToDom(pref: ThemePreference, resolved: ResolvedTheme) {
  document.documentElement.setAttribute("data-theme", resolved);
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // ignore
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");
  const hasSyncedFromServer = useRef(false);

  // Adopt whatever the inline head script already applied — this just brings React state
  // in sync with the DOM attribute set before hydration.
  useEffect(() => {
    const pref = readCached();
    const resolved = resolve(pref);
    setPreferenceState(pref);
    setResolvedTheme(resolved);
    applyToDom(pref, resolved);
  }, []);

  // Once authenticated, the household's server-side preference is the source of truth —
  // fetch it once per session and let it override the local cache if they differ (e.g. the
  // household changed the theme on another device).
  useEffect(() => {
    if (!session || hasSyncedFromServer.current) return;
    hasSyncedFromServer.current = true;
    api
      .get<HouseholdSettings>("/settings")
      .then((settings) => {
        const serverPref = (settings.theme_preference as ThemePreference) ?? "system";
        setPreferenceState((current) => {
          if (serverPref === current) return current;
          const resolved = resolve(serverPref);
          setResolvedTheme(resolved);
          applyToDom(serverPref, resolved);
          return serverPref;
        });
      })
      .catch(() => {
        // Settings fetch failed — keep the local cache, don't block the app.
      });
  }, [session]);

  useEffect(() => {
    if (!session) hasSyncedFromServer.current = false;
  }, [session]);

  // Live-update if the OS-level scheme changes while "system" is selected.
  useEffect(() => {
    if (preference !== "system") return;
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia("(prefers-color-scheme: light)");
    } catch {
      return;
    }
    const onChange = () => {
      const resolved = resolve("system");
      setResolvedTheme(resolved);
      applyToDom("system", resolved);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback(
    (pref: ThemePreference) => {
      const resolved = resolve(pref);
      setPreferenceState(pref);
      setResolvedTheme(resolved);
      applyToDom(pref, resolved);
      if (session) {
        api.patch("/settings", { theme_preference: pref }).catch(() => {
          // Fire-and-forget: local state is already updated optimistically.
        });
      }
    },
    [session]
  );

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
