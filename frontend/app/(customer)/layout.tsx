import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import "./customer.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Your Streak Reward Awaits",
  description: "Show up daily. Don't break the chain — claim the reward.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function StreakLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`ccd ${bricolage.variable} ${hanken.variable}`}>
      <div className="ccd-frame">{children}</div>
    </div>
  );
}
