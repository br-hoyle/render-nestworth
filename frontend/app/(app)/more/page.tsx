"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

const MANAGE_LINKS = [
  { href: "/accounts", label: "Accounts" },
  { href: "/income", label: "Income" },
  { href: "/transactions", label: "Transactions" },
];

export default function MorePage() {
  const { session, logout } = useAuth();

  return (
    <div className="p-4 flex flex-col gap-1">
      <h1 className="text-lg font-medium mb-2">More</h1>

      <div className="text-[9px] uppercase tracking-wider text-nw-muted px-1 mb-1">Manage</div>
      {MANAGE_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="flex justify-between items-center py-3 border-t border-nw-border first:border-t-0 text-sm"
        >
          {link.label}
          <span className="text-nw-muted">›</span>
        </Link>
      ))}

      <div className="text-[9px] uppercase tracking-wider text-nw-muted px-1 mt-4 mb-1">
        Household
      </div>
      <Link
        href="/settings"
        className="flex justify-between items-center py-3 border-t border-nw-border text-sm"
      >
        Settings
        <span className="text-nw-muted">›</span>
      </Link>
      {session?.is_owner && (
        <Link
          href="/admin/invites"
          className="flex justify-between items-center py-3 border-t border-nw-border text-sm"
        >
          Invites <span className="text-[9px] px-1.5 py-0.5 border border-nw-border rounded-full text-nw-muted ml-2">owner</span>
          <span className="text-nw-muted ml-auto">›</span>
        </Link>
      )}
      <button
        onClick={() => logout()}
        className="flex justify-between items-center py-3 border-t border-nw-border text-sm text-nw-muted text-left"
      >
        Sign out
        <span>›</span>
      </button>
    </div>
  );
}
