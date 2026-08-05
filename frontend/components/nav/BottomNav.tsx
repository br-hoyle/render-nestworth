"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/overview", label: "Overview" },
  { href: "/trends/cash-flow", label: "Trends", match: "/trends" },
  { href: "/update", label: "Update", isFab: true },
  { href: "/plan/calculators", label: "Plan", match: "/plan" },
  { href: "/more", label: "More" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="flex md:hidden border-t border-nw-border bg-nw-rail">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.match ?? tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={clsx(
              "flex-1 flex flex-col items-center gap-1 py-2 text-[9px]",
              active ? "text-nw-green" : "text-nw-muted"
            )}
          >
            {tab.isFab ? (
              <span className="w-4 h-4 rounded-full border-[1.5px] border-nw-green text-nw-green flex items-center justify-center text-[11px] leading-none">
                +
              </span>
            ) : (
              <span className="w-3.5 h-3.5 rounded border-[1.5px] border-current opacity-85" />
            )}
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
