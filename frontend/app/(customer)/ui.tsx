"use client";

import type { ActiveMilestone } from "@/lib/customer";

export function Hero({ title, gold, sub }: { title: string; gold: string; sub: string }) {
  return (
    <div className="ccd-hero ccd-in d1">
      <h1>
        {title}
        <span className="gold">{gold}</span>
      </h1>
      <p>{sub}</p>
    </div>
  );
}

export function HowItWorks() {
  return (
    <div className="ccd-hiw ccd-in d3">
      <span className="ccd-hiw-pill">How it works ?</span>
      <h3>How the Streak Works?</h3>
      <p>Scan → Complete the Streaks → Unlock exciting Rewards.</p>
    </div>
  );
}

// Map a reward to a representative emoji + label.
export function rewardIcon(type?: string, title?: string): string {
  const t = (title || "").toLowerCase();
  if (t.includes("coke") || t.includes("coffee") || t.includes("drink")) return "🥤";
  if (t.includes("delivery") || t.includes("ship")) return "🚚";
  switch (type) {
    case "badge":
      return "🏅";
    case "points":
      return "⭐";
    case "coupon":
      return "🎟️";
    default:
      return "🎁";
  }
}

export function MilestoneList({
  milestones,
  current,
}: {
  milestones: ActiveMilestone[];
  current: number;
}) {
  if (!milestones.length) return null;
  return (
    <div className="ccd-milestones ccd-in d3">
      <div className="m-head">Milestone Rewards</div>
      {milestones.map((m) => {
        const won = current >= m.streak_count;
        const pct = Math.min(100, Math.round((current / m.streak_count) * 100));
        return (
          <div className={`ccd-mrow ${won ? "won" : ""}`} key={m.streak_count}>
            <span className="day">Day {m.streak_count}</span>
            <span className="track">
              <i style={{ width: `${pct}%` }} />
            </span>
            <span className="prize">
              <span className="ic">{rewardIcon(m.type, m.title)}</span>
              {m.title}
            </span>
            <span className="check">{won ? "✓" : ""}</span>
          </div>
        );
      })}
    </div>
  );
}

export function RewardModal({
  title,
  code,
  icon,
  onDone,
}: {
  title: string;
  code: string;
  icon: string;
  onDone: () => void;
}) {
  return (
    <div className="ccd-scrim" onClick={onDone}>
      <div className="ccd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ccd-modal-ic coin">{icon}</div>
        <div className="m-label">You Won</div>
        <h2>{title}</h2>
        <p>Show this code at the counter to redeem your reward.</p>
        <div className="ccd-code">{code}</div>
        <button className="ccd-btn" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

export function StreakModal({
  day,
  onDone,
}: {
  day: number;
  onDone: () => void;
}) {
  return (
    <div className="ccd-scrim" onClick={onDone}>
      <div className="ccd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ccd-modal-ic flame">🔥</div>
        <div className="m-label">Streak Alive</div>
        <h2>Day {day} - Keep Going</h2>
        <p>Nice one! Come back tomorrow to keep your streak alive and reach the next reward.</p>
        <button className="ccd-btn" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

export function ErrorModal({
  title,
  message,
  onDone,
}: {
  title: string;
  message: string;
  onDone: () => void;
}) {
  return (
    <div className="ccd-scrim" onClick={onDone}>
      <div className="ccd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ccd-modal-ic error">⚠️</div>
        <h2>{title}</h2>
        <p>{message}</p>
        <button className="ccd-btn" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
