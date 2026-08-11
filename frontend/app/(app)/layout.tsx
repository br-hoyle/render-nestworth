"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "@/components/nav/Sidebar";
import { BottomNav } from "@/components/nav/BottomNav";
import { SessionExpiredModal } from "@/components/nav/SessionExpiredModal";
import { Spinner } from "@/components/ui/Spinner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status, session, secondsRemaining } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  const showCountdown =
    status === "authenticated" && secondsRemaining !== null && secondsRemaining < 300;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        {showCountdown && (
          <div className="bg-nw-amber-tint text-nw-amber text-xs px-3 py-1.5 text-center">
            Session expires in {Math.max(0, Math.round((secondsRemaining ?? 0) / 60))} minute
            {Math.round((secondsRemaining ?? 0) / 60) === 1 ? "" : "s"} — anything you do
            keeps it alive.
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-auto">{children}</div>
        <BottomNav />
      </div>
      {status === "expired" && <SessionExpiredModal lastUsername={session?.username} />}
    </div>
  );
}
