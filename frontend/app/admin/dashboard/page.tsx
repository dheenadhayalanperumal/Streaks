"use client";

import { useEffect, useState } from "react";
import { api, timeAgo } from "@/lib/api";
import type { Stats, ActivityItem, Analytics } from "@/lib/types";
import { Topbar, Avatar } from "../../components";

const KPI_DEFS: { key: keyof Stats; label: string; color: string; suffix?: string }[] = [
  { key: "active_streaks", label: "Active Streaks", color: "var(--brand)" },
  { key: "longest_streak", label: "Longest Streak", color: "var(--brand-2)" },
  { key: "rewards_issued", label: "Rewards Issued", color: "var(--green)" },
  { key: "average_streak", label: "Average Streak", color: "var(--blue)" },
  { key: "missed_days", label: "Missed Days", color: "var(--red)" },
  { key: "completion_rate", label: "Completion Rate", color: "var(--purple)", suffix: "%" },
];

function eventLabel(a: ActivityItem): string {
  switch (a.event_type) {
    case "completed": return "Streak advanced";
    case "reward_unlocked": return "Reward unlocked";
    case "broken": return "Streak broken";
    case "missed": return "Missed period";
    default: return a.event_type;
  }
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [s, a, an] = await Promise.all([
      api.get<Stats>("/api/admin/stats"),
      api.get<{ activity: ActivityItem[] }>("/api/admin/activity?limit=12"),
      api.get<Analytics>("/api/admin/analytics?days=14"),
    ]);
    setStats(s);
    setActivity(a.activity);
    setAnalytics(an);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // live refresh
    return () => clearInterval(t);
  }, []);

  const dau = analytics?.daily_active_users ?? [];
  const maxDau = Math.max(1, ...dau.map((d) => d.users));
  const dist = analytics?.streak_distribution ?? [];
  const maxDist = Math.max(1, ...dist.map((d) => d.users));

  return (
    <>
      <Topbar title="Dashboard" sub="Real-time engagement overview" />
      <div className="content stack">
        {loading || !stats ? (
          <div className="loading">Loading dashboard…</div>
        ) : (
          <>
            <div className="grid kpis">
              {KPI_DEFS.map((k) => (
                <div key={k.key} className="card kpi">
                  <div className="label">
                    <span className="dot" style={{ background: k.color }} /> {k.label}
                  </div>
                  <div className="value">
                    {stats[k.key]}
                    {k.suffix && <small>{k.suffix}</small>}
                  </div>
                </div>
              ))}
            </div>

            <div className="split">
              <div className="card pad-lg">
                <div className="section-title">Daily Active Users <span className="pill gray">14 days</span></div>
                <div className="bars">
                  {dau.length === 0 && <div className="empty">No activity yet</div>}
                  {dau.map((d) => (
                    <div className="bar-col" key={d.day}>
                      <span className="bar-val">{d.users}</span>
                      <div className="bar" style={{ height: `${(d.users / maxDau) * 100}%` }} />
                      <span className="bar-label">{d.day.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card pad-lg">
                <div className="section-title">Streak Distribution</div>
                <div className="bars">
                  {dist.map((d) => (
                    <div className="bar-col" key={d.bucket}>
                      <span className="bar-val">{d.users}</span>
                      <div className="bar blue" style={{ height: `${(d.users / maxDist) * 100}%` }} />
                      <span className="bar-label">{d.bucket}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="split">
              <div className="card pad-lg">
                <div className="section-title">Milestone Redemption</div>
                <div className="table-wrap" style={{ border: "none" }}>
                  <table>
                    <thead>
                      <tr><th>Milestone</th><th>Unlocked</th><th>Redeemed</th><th>Rate</th></tr>
                    </thead>
                    <tbody>
                      {(analytics?.milestone_redemption ?? []).map((m) => {
                        const redeemed = Number(m.redeemed ?? 0);
                        const rate = m.unlocked ? Math.round((redeemed / m.unlocked) * 100) : 0;
                        return (
                          <tr key={m.streak_count}>
                            <td>Day {m.streak_count}</td>
                            <td>{m.unlocked}</td>
                            <td>{redeemed}</td>
                            <td><span className="pill green">{rate}%</span></td>
                          </tr>
                        );
                      })}
                      {(analytics?.milestone_redemption ?? []).length === 0 && (
                        <tr><td colSpan={4} className="muted">No milestones configured</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card pad-lg">
                <div className="section-title">Recent Activity</div>
                <div className="feed">
                  {activity.length === 0 && <div className="empty">No recent events</div>}
                  {activity.map((a, i) => (
                    <div className="feed-item" key={i}>
                      <Avatar name={a.user_name} />
                      <div className="feed-text">
                        <div className="t1">
                          {a.user_name || a.identifier}
                          {a.streak_count != null && <span className="muted"> · Day {a.streak_count}</span>}
                        </div>
                        <div className="t2">{eventLabel(a)} · {a.campaign_name}</div>
                      </div>
                      <div className="feed-time">{timeAgo(a.occurred_at)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
