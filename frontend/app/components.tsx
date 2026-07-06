"use client";

import { ReactNode } from "react";

export function Topbar({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="topbar">
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <span className="x" onClick={onClose}>×</span>
        </header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

const AVATAR_COLORS = ["#ff6a3d", "#4d8dff", "#35d07f", "#9b7bff", "#ffb43d", "#ff5c6c"];

export function Avatar({ name }: { name: string | null }) {
  const label = (name || "?").trim();
  const initials = label.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  const color = AVATAR_COLORS[label.length % AVATAR_COLORS.length];
  return (
    <div className="avatar" style={{ background: color }}>
      {initials}
    </div>
  );
}

export function TypePill({ type }: { type: string }) {
  const map: Record<string, string> = {
    daily: "orange",
    weekly: "blue",
    monthly: "purple",
    custom: "green",
    coupon: "orange",
    points: "blue",
    badge: "purple",
    unlocked: "blue",
    redeemed: "green",
    expired: "red",
    active: "green",
    broken: "red",
  };
  return <span className={`pill ${map[type] || "gray"}`}>{type.replace("_", " ")}</span>;
}
