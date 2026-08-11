"use client";

import clsx from "clsx";
import { MdDarkMode, MdLightMode, MdBrightnessAuto } from "react-icons/md";
import { useTheme, type ThemePreference } from "@/lib/theme-context";

const OPTIONS: { value: ThemePreference; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "system", label: "System", icon: MdBrightnessAuto },
  { value: "light", label: "Light", icon: MdLightMode },
  { value: "dark", label: "Dark", icon: MdDarkMode },
];

const CYCLE: Record<ThemePreference, ThemePreference> = {
  system: "light",
  light: "dark",
  dark: "system",
};

// Compact icon button for quick-access spots (sidebar, mobile "More" list) — cycles
// system -> light -> dark -> system. Shows the *resolved* theme's icon so the button
// always looks like "what you'll get if you tap again", with the preference in the label.
export function ThemeToggleButton({ className }: { className?: string }) {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const Icon = preference === "system" ? MdBrightnessAuto : resolvedTheme === "dark" ? MdDarkMode : MdLightMode;
  const label = preference === "system" ? "System" : preference === "dark" ? "Dark" : "Light";

  return (
    <button
      type="button"
      onClick={() => setPreference(CYCLE[preference])}
      title={`Appearance: ${label} (tap to change)`}
      aria-label={`Appearance: ${label}. Tap to change.`}
      className={clsx(
        "flex items-center gap-1.5 rounded-[10px] px-2 py-1.5 text-[11px] text-nw-muted hover:text-nw-text hover:bg-nw-rail transition-colors",
        className
      )}
    >
      <Icon className="w-4 h-4 flex-none" />
      {label}
    </button>
  );
}

// Full 3-way segmented control for the Settings page.
export function ThemeSegmentedControl() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="inline-flex rounded-[10px] border border-nw-border bg-nw-rail p-0.5 gap-0.5">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setPreference(value)}
            aria-pressed={active}
            className={clsx(
              "flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-xs transition-colors",
              active ? "bg-nw-green-tint text-nw-mint" : "text-nw-muted hover:text-nw-text"
            )}
          >
            <Icon className="w-3.5 h-3.5 flex-none" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
