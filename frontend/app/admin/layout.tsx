"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getToken, clearToken } from "@/lib/api";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", ico: "▦" },
  { href: "/admin/campaigns", label: "Streak Rules", ico: "🔥" },
  { href: "/admin/rewards", label: "Rewards", ico: "🎁" },
  { href: "/admin/analytics", label: "Analytics", ico: "📈" },
  { href: "/admin/users", label: "Users", ico: "👤" },
  { href: "/admin/settings", label: "Brand Profile", ico: "🎨" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
    } else {
      setReady(true);
    }
  }, [router]);

  function logout() {
    clearToken();
    router.replace("/login");
  }

  if (!ready) return <div className="loading">Loading…</div>;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="flame">🔥</span> Streaks
        </div>
        <nav className="nav">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""}>
                <span className="ico">{item.ico}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="who">Signed in as operator</div>
          <button className="btn ghost sm" onClick={logout} style={{ width: "100%", justifyContent: "center" }}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
