"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Reward } from "@/lib/types";
import { Topbar, Modal, TypePill } from "../../components";

interface Draft {
  title: string;
  description: string;
  type: Reward["type"];
  value: string;
  image: string;
  validity_days: string;
  active: boolean;
}

const empty: Draft = { title: "", description: "", type: "coupon", value: "", image: "", validity_days: "", active: true };

export default function RewardsPage() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await api.get<{ rewards: Reward[] }>("/api/admin/rewards");
    setRewards(r.rewards);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditId(null); setDraft(empty); setError(""); setOpen(true); }
  function openEdit(r: Reward) {
    setEditId(r.id);
    setDraft({
      title: r.title, description: r.description || "", type: r.type, value: r.value || "",
      image: r.image || "", validity_days: r.validity_days != null ? String(r.validity_days) : "", active: !!r.active,
    });
    setError(""); setOpen(true);
  }
  function up<K extends keyof Draft>(k: K, v: Draft[K]) { setDraft((d) => ({ ...d, [k]: v })); }

  async function save() {
    setSaving(true); setError("");
    try {
      const payload = {
        title: draft.title, description: draft.description, type: draft.type, value: draft.value,
        image: draft.image, validity_days: draft.validity_days === "" ? null : Number(draft.validity_days), active: draft.active,
      };
      if (editId) await api.put(`/api/admin/rewards/${editId}`, payload);
      else await api.post("/api/admin/rewards", payload);
      setOpen(false); await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally { setSaving(false); }
  }

  async function toggle(r: Reward) {
    await api.put(`/api/admin/rewards/${r.id}`, { ...r, active: r.active ? false : true });
    await load();
  }
  async function remove(id: number) {
    if (!confirm("Delete this reward?")) return;
    await api.del(`/api/admin/rewards/${id}`);
    await load();
  }

  return (
    <>
      <Topbar title="Rewards" sub="Define the rewards that streaks unlock"
        action={<button className="btn primary" onClick={openNew}>+ New Reward</button>} />
      <div className="content">
        {loading ? <div className="loading">Loading…</div> : (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {rewards.map((r) => (
              <div className="card" key={r.id}>
                <div className="flex" style={{ justifyContent: "space-between", marginBottom: 10 }}>
                  <TypePill type={r.type} />
                  {r.active ? <span className="pill green">Active</span> : <span className="pill gray">Disabled</span>}
                </div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{r.title}</div>
                <div className="muted" style={{ margin: "6px 0 12px", minHeight: 34 }}>{r.description || "No description"}</div>
                <div className="flex" style={{ gap: 16, fontSize: 12.5, color: "var(--text-dim)", marginBottom: 14 }}>
                  {r.value && <span>Value: <b style={{ color: "var(--text)" }}>{r.value}</b></span>}
                  {r.validity_days != null && <span>Valid {r.validity_days}d</span>}
                </div>
                <div className="flex" style={{ justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <div className="muted">Issued {r.issued || 0} · Redeemed {r.redeemed || 0}</div>
                  <div className="flex">
                    <button className="btn sm ghost" onClick={() => toggle(r)}>{r.active ? "Disable" : "Enable"}</button>
                    <button className="btn sm ghost" onClick={() => openEdit(r)}>Edit</button>
                    <button className="btn sm danger" onClick={() => remove(r.id)}>×</button>
                  </div>
                </div>
              </div>
            ))}
            {rewards.length === 0 && <div className="empty">No rewards yet.</div>}
          </div>
        )}
      </div>

      {open && (
        <Modal
          title={editId ? "Edit Reward" : "New Reward"}
          onClose={() => setOpen(false)}
          footer={<>
            <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Reward"}</button>
          </>}
        >
          {error && <div className="error-banner">{error}</div>}
          <div className="field">
            <label>Title</label>
            <input className="input" value={draft.title} onChange={(e) => up("title", e.target.value)} />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea className="input" value={draft.description} onChange={(e) => up("description", e.target.value)} />
          </div>
          <div className="row2">
            <div className="field">
              <label>Type</label>
              <select className="input" value={draft.type} onChange={(e) => up("type", e.target.value as Reward["type"])}>
                <option value="coupon">Coupon</option>
                <option value="points">Points</option>
                <option value="badge">Badge</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="field">
              <label>Value</label>
              <input className="input" value={draft.value} onChange={(e) => up("value", e.target.value)} placeholder="10% / 500 / gold" />
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label>Validity (days)</label>
              <input className="input" type="number" min={0} value={draft.validity_days} onChange={(e) => up("validity_days", e.target.value)} placeholder="never expires" />
            </div>
            <div className="field">
              <label>Image URL</label>
              <input className="input" value={draft.image} onChange={(e) => up("image", e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={draft.active} onChange={(e) => up("active", e.target.checked)} /> Active
            </label>
          </div>
        </Modal>
      )}
    </>
  );
}
