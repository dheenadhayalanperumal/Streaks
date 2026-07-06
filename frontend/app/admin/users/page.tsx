"use client";

import { useEffect, useState } from "react";
import { api, timeAgo } from "@/lib/api";
import type { UserRow } from "@/lib/types";
import { Topbar, Modal, Avatar, TypePill } from "../../components";

interface UserDetail {
  id: number;
  name: string | null;
  identifier: string;
  created_at: string;
  enrollments: {
    enrollment_id: number; campaign_id: number; campaign_name: string; type: string;
    current_count: number; longest_count: number; missed_count: number; status: string; last_completed_at: string | null;
  }[];
  timeline: { event_type: string; period_key: string | null; streak_count: number | null; meta: string | null; occurred_at: string; campaign_name: string }[];
  rewards: { id: number; code: string; status: string; issued_at: string; expires_at: string | null; title: string; type: string; value: string | null }[];
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<UserDetail | null>(null);

  async function load() {
    const r = await api.get<{ users: UserRow[] }>(`/api/admin/users?search=${encodeURIComponent(search)}`);
    setUsers(r.users);
    setLoading(false);
  }
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [search]);

  async function openUser(id: number) {
    const r = await api.get<{ user: UserDetail }>(`/api/admin/users/${id}`);
    setDetail(r.user);
  }

  async function adjust(enrollmentId: number, current: number) {
    const val = prompt("Set current streak count to:", String(current));
    if (val === null) return;
    await api.post(`/api/admin/users/${detail!.id}/adjust-streak`, { enrollment_id: enrollmentId, current_count: Number(val) });
    await openUser(detail!.id);
    await load();
  }

  async function updateReward(id: number, status: string) {
    await api.patch(`/api/admin/reward-issues/${id}`, { status });
    await openUser(detail!.id);
  }

  return (
    <>
      <Topbar title="Users" sub="Every participant, their streaks & reward history"
        action={<div className="search"><input className="input" placeholder="Search name or identifier…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>} />
      <div className="content">
        {loading ? <div className="loading">Loading…</div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>User</th><th>Current</th><th>Longest</th><th>Missed</th><th>Rewards</th><th>Last Activity</th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ cursor: "pointer" }} onClick={() => openUser(u.id)}>
                    <td>
                      <div className="flex">
                        <Avatar name={u.name || u.identifier} />
                        <div>
                          <div style={{ fontWeight: 600 }}>{u.name || "—"}</div>
                          <div className="muted">{u.identifier}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className="pill orange">🔥 {u.current_streak}</span></td>
                    <td>{u.longest_streak}</td>
                    <td>{u.missed_days}</td>
                    <td>{u.rewards_earned}</td>
                    <td className="muted">{timeAgo(u.last_activity)}</td>
                  </tr>
                ))}
                {users.length === 0 && <tr><td colSpan={6} className="empty">No users found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && (
        <Modal title={detail.name || detail.identifier} onClose={() => setDetail(null)}>
          <div className="muted" style={{ marginBottom: 16 }}>{detail.identifier} · joined {detail.created_at?.slice(0, 10)}</div>

          <div className="section-title" style={{ fontSize: 13 }}>Streaks</div>
          <div className="stack" style={{ gap: 8, marginBottom: 18 }}>
            {detail.enrollments.map((e) => (
              <div key={e.enrollment_id} className="card" style={{ padding: 12 }}>
                <div className="flex" style={{ justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{e.campaign_name} <TypePill type={e.type} /></div>
                    <div className="muted">Current {e.current_count} · Longest {e.longest_count} · Missed {e.missed_count} · <TypePill type={e.status} /></div>
                  </div>
                  <button className="btn sm ghost" onClick={() => adjust(e.enrollment_id, e.current_count)}>Adjust</button>
                </div>
              </div>
            ))}
            {detail.enrollments.length === 0 && <div className="muted">No enrollments</div>}
          </div>

          <div className="section-title" style={{ fontSize: 13 }}>Rewards</div>
          <div className="stack" style={{ gap: 8, marginBottom: 18 }}>
            {detail.rewards.map((r) => (
              <div key={r.id} className="flex" style={{ justifyContent: "space-between" }}>
                <div>
                  <b>{r.title}</b> <span className="muted">· {r.code}</span> <TypePill type={r.status} />
                </div>
                {r.status !== "redeemed" && <button className="btn sm ghost" onClick={() => updateReward(r.id, "redeemed")}>Mark redeemed</button>}
              </div>
            ))}
            {detail.rewards.length === 0 && <div className="muted">No rewards earned</div>}
          </div>

          <div className="section-title" style={{ fontSize: 13 }}>Timeline</div>
          <div className="feed">
            {detail.timeline.slice(0, 40).map((t, i) => (
              <div className="feed-item" key={i}>
                <div className="feed-text">
                  <div className="t1"><TypePill type={t.event_type === "completed" ? "active" : t.event_type} /> {t.streak_count != null && <span>Day {t.streak_count}</span>}</div>
                  <div className="t2">{t.campaign_name}</div>
                </div>
                <div className="feed-time">{timeAgo(t.occurred_at)}</div>
              </div>
            ))}
            {detail.timeline.length === 0 && <div className="muted">No events</div>}
          </div>
        </Modal>
      )}
    </>
  );
}
