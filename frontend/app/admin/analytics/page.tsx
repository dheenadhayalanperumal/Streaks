"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Analytics, Campaign } from "@/lib/types";
import { Topbar } from "../../components";

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [days, setDays] = useState(30);
  const [campaignId, setCampaignId] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const q = new URLSearchParams({ days: String(days) });
    if (campaignId) q.set("campaign_id", campaignId);
    const [a, c] = await Promise.all([
      api.get<Analytics>(`/api/admin/analytics?${q.toString()}`),
      campaigns.length ? Promise.resolve({ campaigns }) : api.get<{ campaigns: Campaign[] }>("/api/admin/campaigns"),
    ]);
    setData(a);
    if (!campaigns.length) setCampaigns(c.campaigns);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days, campaignId]);

  const dau = data?.daily_active_users ?? [];
  const maxDau = Math.max(1, ...dau.map((d) => d.users));
  const dist = data?.streak_distribution ?? [];
  const maxDist = Math.max(1, ...dist.map((d) => d.users));
  const funnel = data?.milestone_redemption ?? [];
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.unlocked));

  return (
    <>
      <Topbar title="Analytics" sub="Retention, streak cohorts & milestone funnel"
        action={
          <div className="flex">
            <select className="input" style={{ width: "auto" }} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">All campaigns</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="input" style={{ width: "auto" }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>
        } />
      <div className="content stack">
        {loading ? <div className="loading">Loading…</div> : (
          <>
            <div className="card pad-lg">
              <div className="section-title">Daily Active Users</div>
              <div className="bars" style={{ height: 220 }}>
                {dau.length === 0 && <div className="empty">No activity in range</div>}
                {dau.map((d) => (
                  <div className="bar-col" key={d.day}>
                    <span className="bar-val">{d.users}</span>
                    <div className="bar" style={{ height: `${(d.users / maxDau) * 100}%` }} />
                    <span className="bar-label">{d.day.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="split">
              <div className="card pad-lg">
                <div className="section-title">Streak-length Cohorts</div>
                <div className="bars">
                  {dist.map((d) => (
                    <div className="bar-col" key={d.bucket}>
                      <span className="bar-val">{d.users}</span>
                      <div className="bar green" style={{ height: `${(d.users / maxDist) * 100}%` }} />
                      <span className="bar-label">{d.bucket}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card pad-lg">
                <div className="section-title">Milestone Funnel</div>
                <div className="stack" style={{ gap: 10 }}>
                  {funnel.length === 0 && <div className="empty">No milestones</div>}
                  {funnel.map((f) => {
                    const redeemed = Number(f.redeemed ?? 0);
                    return (
                      <div key={f.streak_count}>
                        <div className="flex" style={{ justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontWeight: 600 }}>Day {f.streak_count}</span>
                          <span className="muted">{f.unlocked} unlocked · {redeemed} redeemed</span>
                        </div>
                        <div style={{ height: 10, background: "var(--bg)", borderRadius: 6, overflow: "hidden", position: "relative" }}>
                          <div style={{ position: "absolute", inset: 0, width: `${(f.unlocked / maxFunnel) * 100}%`, background: "rgba(77,141,255,0.35)" }} />
                          <div style={{ position: "absolute", inset: 0, width: `${(redeemed / maxFunnel) * 100}%`, background: "var(--green)" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
