"use client";

import Image from "next/image";
import { useTheme } from "@/lib/theme-context";

type Variant = "brandmark" | "wordmark" | "logo-tagline";

const ALT_TEXT: Record<Variant, string> = {
  brandmark: "",
  wordmark: "NestWorth",
  "logo-tagline": "NestWorth — Where every dollar becomes your nest egg",
};

export function ThemedLogo({
  variant,
  width,
  height,
  className,
  // "primary" (default): full-color on dark canvas, on-light on light canvas — for
  // prominent placements (headers, hero, login/signup). "sparing": the monochrome white
  // (dark canvas) / green (light canvas) colorway, per the brand guide's rule that those
  // two only get used sparingly, in small spaces like a footer — never a colored mark on
  // a background it doesn't have enough contrast against (e.g. white-on-green everywhere).
  tone = "primary",
  // Bypasses the app's own light/dark resolution — for spots where the surrounding surface
  // color doesn't follow the app theme (e.g. a marketing-page band that's vibrant green in
  // light mode instead of the usual white/light canvas), so the mark needs a specific file
  // regardless of which theme is active.
  forceTheme,
}: {
  variant: Variant;
  width: number;
  height: number;
  className?: string;
  tone?: "primary" | "sparing";
  forceTheme?: "light" | "dark";
}) {
  const { resolvedTheme } = useTheme();
  const theme = forceTheme ?? resolvedTheme;
  const suffix = tone === "sparing" ? `sparing-${theme}` : theme;
  return (
    <Image
      src={`/brand/${variant}-${suffix}.png`}
      alt={ALT_TEXT[variant]}
      width={width}
      height={height}
      className={className}
    />
  );
}
