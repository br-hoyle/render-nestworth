"use client";

import { useTheme } from "@/lib/theme-context";
import { ThemedLogo } from "@/components/brand/ThemedLogo";

// Header/footer band on the marketing page sits on the plain dark canvas in dark mode (where
// the normal full-color mark is correct) but on a vibrant green band in light mode — which
// needs the white knockout mark, not the on-light one the rest of the light theme uses.
export function MarketingBrandLogo({
  variant,
  width,
  height,
  className,
}: {
  variant: "brandmark" | "wordmark";
  width: number;
  height: number;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  if (resolvedTheme === "light") {
    return <ThemedLogo variant={variant} width={width} height={height} className={className} tone="sparing" forceTheme="dark" />;
  }
  return <ThemedLogo variant={variant} width={width} height={height} className={className} />;
}
