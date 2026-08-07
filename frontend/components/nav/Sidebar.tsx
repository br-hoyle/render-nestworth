"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  MdOutlineBarChart,
  MdOutlineCalculate,
  MdOutlineCreditCard,
  MdOutlineHome,
  MdOutlineLayers,
  MdOutlineTrendingUp,
} from "react-icons/md";
import { TbMoneybagPlus } from "react-icons/tb";
import { useAuth } from "@/lib/auth-context";

const NAV_GROUPS: { heading: string; items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] }[] = [
  {
    heading: "Track",
    items: [
      { href: "/overview", label: "Overview", icon: MdOutlineHome },
      { href: "/trends/cash-flow", label: "Cash Flow", icon: MdOutlineBarChart },
      { href: "/trends/scorecard", label: "Scorecard", icon: MdOutlineTrendingUp },
    ],
  },
  {
    heading: "Manage",
    items: [
      { href: "/accounts", label: "Accounts", icon: MdOutlineLayers },
      { href: "/income", label: "Income", icon: TbMoneybagPlus },
      { href: "/transactions", label: "Transactions", icon: MdOutlineCreditCard },
    ],
  },
  {
    heading: "Plan",
    items: [{ href: "/plan/calculators", label: "Calculators", icon: MdOutlineCalculate }],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { session, secondsRemaining, logout } = useAuth();

  return (
    <div className="hidden md:flex w-[190px] flex-none flex-col gap-0.5 border-r border-nw-border bg-nw-rail p-2.5">
      <div className="flex items-center gap-2 px-1 py-2 mb-2">
        <Image src="/brand/brandmark.png" alt="" width={20} height={20} />
        <span className="text-sm font-semibold">
          Nest<span className="text-nw-green">Worth</span>
        </span>
      </div>

      {NAV_GROUPS.map((group) => (
        <div key={group.heading} className="flex flex-col gap-0.5 mb-2">
          <div className="text-[9px] uppercase tracking-wider text-nw-muted px-2 mt-2 mb-0.5">
            {group.heading}
          </div>
          {group.items.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px]",
                  active
                    ? "bg-nw-green-tint text-nw-mint shadow-[inset_2px_0_0_var(--nw-green)]"
                    : "text-nw-muted hover:text-nw-text"
                )}
              >
                <Icon className="w-4 h-4 flex-none" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="flex-1" />

      <Link
        href="/settings"
        className={clsx(
          "rounded-md px-2 py-1.5 text-[11px]",
          pathname.startsWith("/settings")
            ? "bg-nw-green-tint text-nw-mint"
            : "text-nw-muted hover:text-nw-text"
        )}
      >
        Settings
      </Link>

      {session && (
        <div className="flex flex-col gap-1 px-2 py-2 border-t border-nw-border mt-1">
          <span className="text-[10px] text-[#B6C6BB]">{session.household_name}</span>
          <span className="text-[8.5px] text-nw-muted">
            session {secondsRemaining !== null ? Math.max(0, Math.round(secondsRemaining / 60)) : "—"}m
            left
          </span>
          <button
            onClick={() => logout()}
            className="text-[10px] text-nw-muted hover:text-nw-coral text-left mt-1"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
