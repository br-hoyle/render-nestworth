import type { Metadata } from "next";
import { Poppins, Public_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "NestWorth",
  description: "Where every dollar becomes your nest egg",
  icons: { icon: "/icon.png", apple: "/apple-icon.png" },
};

// Applies the cached/system theme preference before first paint, so there's no flash of
// the wrong theme while ThemeProvider (lib/theme-context.tsx) hydrates. Mirrors that
// provider's own resolve()/readCached() logic — keep the two in sync if either changes.
const NO_FLASH_THEME_SCRIPT = `(function(){try{var p=localStorage.getItem('nw-theme-preference');if(p!=='light'&&p!=='dark'&&p!=='system')p='system';var r;if(p==='light'||p==='dark'){r=p;}else{try{r=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}catch(e){r='dark';}}document.documentElement.setAttribute('data-theme',r);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${publicSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-nw-bg text-nw-text">
        <AuthProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
