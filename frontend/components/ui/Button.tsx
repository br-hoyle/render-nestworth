import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variantClasses: Record<Variant, string> = {
  // Solid-fill green, per the brand guide's "Add account" button spec. `text-nw-bg` is the
  // intentional choice here (not a fixed color): it's dark in dark theme (dark text needed on
  // the bright dark-mode accent) and light in light theme (light text needed on the deeper
  // light-mode accent) — same token, correct on-accent contrast in both themes for free.
  primary: "bg-nw-green text-nw-bg hover:bg-nw-green-deep",
  secondary: "border border-nw-border text-nw-text hover:bg-nw-surface",
  danger: "border border-[#5A3228] text-nw-coral hover:bg-nw-coral-tint",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", className, ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        "rounded-[10px] px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
