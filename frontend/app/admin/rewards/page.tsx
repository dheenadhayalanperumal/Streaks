"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Reward } from "@/lib/types";
import { Topbar, Modal, TypePill, Field, ImageUpload, focusFirstInvalid } from "../../components";
import {
  LIMITS,
  type Errors,
  hasErrors,
  intRange,
  maxLen,
  required,
} from "@/lib/validation";

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

function validate(d: Draft): Errors {
  return {
    title: required("Title", d.title) || maxLen("Title", d.title, LIMITS.title),
    description: maxLen("Description", d.description, LIMITS.description),
    value: maxLen("Value", d.value, LIMITS.value),
    validity_days: intRange("Validity", d.validity_days, 1, 3650, true),
  };
}

export default function RewardsPage() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState("");
  const [saving, setSaving] = useState(false);

  const errors = useMemo(() => validate(draft), [draft]);
  const invalid = hasErrors(errors);

  async function load() {
    const r = await api.get<{ rewards: Reward[] }>("/api/admin/rewards");
    setRewards(r.rewards);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditId(null); setDraft(empty); setError(""); setTouched(false); setOpen(true); }
  // The list response omits the image bytes, so pull the full row to edit it.
  async function openEdit(row: Reward) {
    setError(""); setImageError(""); setTouched(false);
    try {
      const { reward: r } = await api.get<{ reward: Reward }>(`/api/admin/rewards/${row.id}`);
      setEditId(r.id);
      setDraft({
        title: r.title, description: r.description || "", type: r.type, value: r.value || "",
        image: r.image || "", validity_days: r.validity_days != null ? String(r.validity_days) : "", active: !!r.active,
      });
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that reward");
    }
  }
  function up<K extends keyof Draft>(k: K, v: Draft[K]) { setDraft((d) => ({ ...d, [k]: v })); }

  async function save() {
    setTouched(true);
    if (invalid) {
      setError("Fix the highlighted fields before saving.");
      focusFirstInvalid();
      return;
    }
    setSaving(true); setError("");
    try {
      const payload = {
        title: draft.title.trim(), description: draft.description.trim(), type: draft.type, value: draft.value.trim(),
        image: draft.image, validity_days: draft.validity_days === "" ? null : Number(draft.validity_days), active: draft.active,
      };
      if (editId) await api.put(`/api/admin/rewards/${editId}`, payload);
      else await api.post("/api/admin/rewards", payload);
      setOpen(false); await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally { setSaving(false); }
  }

  // Flips only the `active` flag. Re-submitting the whole row here meant a
  // reward stored under older rules could not be enabled or disabled at all.
  async function toggle(r: Reward) {
    setError("");
    try {
      await api.patch(`/api/admin/rewards/${r.id}/active`, { active: !r.active });
      await load();
    } catch (err) {
      setError(`Could not update "${r.title}": ${err instanceof Error ? err.message : "request failed"}`);
    }
  }
  async function remove(id: number) {
    if (!confirm("Delete this reward?")) return;
    setError("");
    try {
      await api.del(`/api/admin/rewards/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <>
      <Topbar title="Rewards" sub="Define the rewards that streaks unlock"
        action={<button className="btn primary" onClick={openNew}>+ New Reward</button>} />
      <div className="content">
        {/* List-level failures (toggle, delete) need a home outside the modal. */}
        {error && !open && <div className="error-banner" role="alert">{error}</div>}
        {loading ? <div className="loading">Loading…</div> : (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {rewards.map((r) => (
              <div className="card" key={r.id}>
                <div className="flex" style={{ justifyContent: "space-between", marginBottom: 10 }}>
                  <TypePill type={r.type} />
                  {r.active ? <span className="pill green">Active</span> : <span className="pill gray">Disabled</span>}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="flex" style={{ gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 17, fontWeight: 700 }}>{r.title}</span>
                    {!!r.has_image && <span className="pill gray" title="Has an image">🖼</span>}
                  </div>
                  <div className="muted" style={{ margin: "6px 0 12px", minHeight: 34 }}>{r.description || "No description"}</div>
                </div>
                <div className="flex" style={{ gap: 16, fontSize: 12.5, color: "var(--text-dim)", marginBottom: 14 }}>
                  {r.value && <span>Value: <b style={{ color: "var(--text)" }}>{r.value}</b></span>}
                  {r.validity_days != null && <span>Valid {r.validity_days}d</span>}
                </div>
                <div className="flex" style={{ justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <div className="muted">Issued {r.issued || 0} · Redeemed {r.redeemed || 0}</div>
                  <div className="flex">
                    <button className="btn sm ghost" onClick={() => toggle(r)}>{r.active ? "Disable" : "Enable"}</button>
                    <button className="btn sm ghost" onClick={() => openEdit(r)}>Edit</button>
                    <button className="btn sm danger" aria-label={`Delete ${r.title}`} onClick={() => remove(r.id)}>×</button>
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
          onSubmit={save}
          footer={<>
            <button className="btn ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Reward"}
            </button>
          </>}
        >
          {error && <div className="error-banner">{error}</div>}
          <Field label="Title" required error={errors.title} touched={touched} counter={`${draft.title.length}/${LIMITS.title}`}>
            <input
              className="input"
              value={draft.title}
              maxLength={LIMITS.title}
              placeholder="Free coffee"
              onChange={(e) => up("title", e.target.value)}
            />
          </Field>
          <Field
            label="Description"
            error={errors.description}
            touched={touched}
            counter={`${draft.description.length}/${LIMITS.description}`}
          >
            <textarea
              className="input"
              value={draft.description}
              maxLength={LIMITS.description}
              onChange={(e) => up("description", e.target.value)}
            />
          </Field>
          <div className="row2">
            <Field label="Type">
              <select className="input" value={draft.type} onChange={(e) => up("type", e.target.value as Reward["type"])}>
                <option value="coupon">Coupon</option>
                <option value="points">Points</option>
                <option value="badge">Badge</option>
                <option value="custom">Custom</option>
              </select>
            </Field>
            <Field label="Value" error={errors.value} touched={touched}>
              <input
                className="input"
                value={draft.value}
                maxLength={LIMITS.value}
                onChange={(e) => up("value", e.target.value)}
                placeholder="10% / 500 / gold"
              />
            </Field>
          </div>
          <Field
            label="Validity (days)"
            error={errors.validity_days}
            touched={touched}
            hint="Leave blank so the reward never expires."
          >
            <input
              className="input"
              type="number"
              min={1}
              max={3650}
              value={draft.validity_days}
              onChange={(e) => up("validity_days", e.target.value)}
              placeholder="never expires"
            />
          </Field>
          {/* Upload failures land on the field itself, not the modal banner:
              the banner is shared with save() and each would wipe the other. */}
          <Field label="Reward Image" error={imageError} touched={!!imageError}>
            <ImageUpload
              value={draft.image}
              onChange={(v) => up("image", v)}
              onError={setImageError}
              shape="wide"
              hint="Shown on the reward card. PNG, JPG, WebP or GIF — resized automatically."
            />
          </Field>
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-start" }}>
              <input type="checkbox" checked={draft.active} onChange={(e) => up("active", e.target.checked)} /> Active
            </label>
          </div>
        </Modal>
      )}
    </>
  );
}
