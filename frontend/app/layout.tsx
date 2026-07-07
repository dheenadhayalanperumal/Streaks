import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const body = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Streaks — Admin",
  description: "Habit & engagement streak campaign platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <head>
        {/* Runtime API endpoint — loaded before the app so fetches resolve. */}
        <Script src="/config.js" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );
}
