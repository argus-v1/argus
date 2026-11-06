import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Spectral } from "next/font/google";
import { IconSprite } from "@/components/Icons";
import { Nav } from "@/components/Nav";
import "./globals.css";

const serif = Spectral({ variable: "--font-spectral", subsets: ["latin"], weight: ["300", "400", "500"], style: ["normal", "italic"] });
const sans = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Argus · Make them prove it", template: "%s · Argus" },
  description: "Argus verifies the claim in a pull request with real tests, then posts the evidence on GitHub.",
  openGraph: { title: "Argus · Don't close the door. Make them prove it.", description: "Four agents prove or break a pull request's claim with real tests." },
};

export const viewport: Viewport = { themeColor: "#0d0d0b", viewportFit: "cover" };

const MOTION_SCRIPT = `try{var d=document.documentElement;d.classList.add("js");if(matchMedia("(prefers-reduced-motion: reduce)").matches||location.search.indexOf("static")>-1)d.classList.add("still")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* mark JS before first paint so reveal animations start hidden, not flash */}
        <script dangerouslySetInnerHTML={{ __html: MOTION_SCRIPT }} />
      </head>
      <body>
        <IconSprite />
        <Nav />
        {children}
      </body>
    </html>
  );
}
