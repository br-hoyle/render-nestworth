import { InputHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[11px] uppercase tracking-wide text-nw-muted"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            "rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm text-nw-text placeholder:text-nw-muted",
            "focus:outline-none focus:border-nw-green-line",
            error && "border-[#5A3228]",
            className
          )}
          {...props}
        />
        {error && <span className="text-xs text-nw-coral">{error}</span>}
      </div>
    );
  }
);
TextField.displayName = "TextField";
