import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Spectral } from "next/font/google";
import { IconSprite } from "@/components/Icons";
import { Nav } from "@/components/Nav";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./ui.css";
import "./globals.css";

const serif = Spectral({ variable: "--font-spectral", subsets: ["latin"], weight: ["300", "400", "500"], style: ["normal", "italic"] });
const sans = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Argus · Make them prove it", template: "%s · Argus" },
  description: "Argus verifies the claim in a pull request with real tests, then posts the evidence on GitHub.",
  openGraph: { title: "Argus · Don't close the door. Make them prove it.", description: "Four agents prove or break a pull request's claim with real tests." },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0b" },
    { media: "(prefers-color-scheme: light)", color: "#f3f1ea" },
  ],
  viewportFit: "cover",
};

const MOTION_SCRIPT = `try{var d=document.documentElement;var t=null;try{t=localStorage.getItem("argus.theme")}catch(e){}var q=location.search.match(/theme=(light|dark)/);if(q)t=q[1];if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";d.dataset.theme=t;d.classList.add("js");if(matchMedia("(prefers-reduced-motion: reduce)").matches||location.search.indexOf("static")>-1)d.classList.add("still")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* theme and motion flags before first paint: no theme flash, reveals start hidden */}
        <script dangerouslySetInnerHTML={{ __html: MOTION_SCRIPT }} />
      </head>
      <body>
        <IconSprite />
        <TooltipProvider delayDuration={150}>
          <Nav />
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
