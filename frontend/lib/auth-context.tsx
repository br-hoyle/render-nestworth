"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api, ApiError } from "./api";
import type { SessionInfo } from "./types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "expired";

interface AuthContextValue {
  status: AuthStatus;
  session: SessionInfo | null;
  secondsRemaining: number | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const POLL_INTERVAL_MS = 60_000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const hasAuthenticatedOnce = useRef(false);

  const fetchMe = useCallback(async () => {
    try {
      const info = await api.get<SessionInfo>("/auth/me");
      setSession(info);
      setStatus("authenticated");
      hasAuthenticatedOnce.current = true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setStatus(hasAuthenticatedOnce.current ? "expired" : "unauthenticated");
      } else {
        // Network/API-down: don't bounce the user to /login for a transient error.
        setStatus(hasAuthenticatedOnce.current ? "authenticated" : "unauthenticated");
      }
    }
  }, []);

  useEffect(() => {
    fetchMe();
    const id = setInterval(fetchMe, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchMe]);

  useEffect(() => {
    if (!session) {
      setSecondsRemaining(null);
      return;
    }
    const tick = () => {
      const remaining = session.session_expires_at - Math.floor(Date.now() / 1000);
      setSecondsRemaining(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session]);

  const login = useCallback(async (username: string, password: string) => {
    const info = await api.post<SessionInfo>("/auth/login", { username, password });
    setSession(info);
    setStatus("authenticated");
    hasAuthenticatedOnce.current = true;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setSession(null);
      hasAuthenticatedOnce.current = false;
      setStatus("unauthenticated");
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ status, session, secondsRemaining, login, logout, refresh: fetchMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
