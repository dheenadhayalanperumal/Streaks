"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Campaign, Reward, Milestone } from "@/lib/types";
import { Topbar, Modal, TypePill, Field, focusFirstInvalid } from "../../components";
import {
  LIMITS,
  type Errors,
  dateOrder,
  hasErrors,
  intValue,
  isoDate,
  maxLen,
  numValue,
  required,
  timezone as validTimezone,
} from "@/lib/validation";

interface Draft {
  name: string;
  description: string;
  type: Campaign["type"];
  custom_period_days: number;
  missed_day_behaviour: Campaign["missed_day_behaviour"];
  qualifying_action: string;
  timezone: string;
  start_date: string;
  end_date: string;
  active: boolean;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_m: number | null;
  geofence_enabled: boolean;
  milestones: Milestone[];
}

const emptyDraft: Draft = {
  name: "", description: "", type: "daily", custom_period_days: 3,
  missed_day_behaviour: "break", qualifying_action: "check_in", timezone: "Asia/Kolkata",
  start_date: "", end_date: "", active: true, latitude: null, longitude: null,
  geofence_radius_m: null, geofence_enabled: false, milestones: [],
};

function validate(d: Draft): Errors {
  // A milestone set is only usable when every row has a day and a reward, and
  // no two rows fight over the same day.
  const days = d.milestones.map((m) => m.streak_count);
  const milestoneError =
    d.milestones.some((m) => !Number.isInteger(m.streak_count) || m.streak_count < 1 || m.streak_count > 3650)
      ? "Every milestone needs a day between 1 and 3650."
      : d.milestones.some((m) => !m.reward_id)
        ? "Every milestone needs a reward."
        : new Set(days).size !== days.length
          ? "Two milestones share the same day — each day can unlock one reward."
          : null;

  return {
    name: required("Name", d.name) || maxLen("Name", d.name, LIMITS.campaignName),
    description: maxLen("Description", d.description, LIMITS.description),
    custom_period_days:
      d.type === "custom" ? intValue("Custom period", d.custom_period_days, 1, 3650) : null,
    // Optional here to match the API, which defaults a blank to "check_in".
    qualifying_action: maxLen("Qualifying action", d.qualifying_action, LIMITS.qualifyingAction),
    timezone: validTimezone(d.timezone),
    start_date: isoDate(d.start_date, "Start date"),
    end_date: isoDate(d.end_date, "End date") || dateOrder(d.start_date, d.end_date),
    latitude: d.geofence_enabled ? numValue("Latitude", d.latitude, -90, 90) : null,
    longitude: d.geofence_enabled ? numValue("Longitude", d.longitude, -180, 180) : null,
    geofence_radius_m: d.geofence_enabled
      ? intValue("Radius", d.geofence_radius_m, 1, 100000)
      : null,
    milestones: milestoneError,
  };
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const errors = useMemo(() => validate(draft), [draft]);
  const invalid = hasErrors(errors);

  async function load() {
    const [c, r] = await Promise.all([
      api.get<{ campaigns: Campaign[] }>("/api/admin/campaigns"),
      api.get<{ rewards: Reward[] }>("/api/admin/rewards"),
    ]);
    setCampaigns(c.campaigns);
    setRewards(r.rewards);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditId(null);
    setDraft(emptyDraft);
    setError("");
    setTouched(false);
    setOpen(true);
  }

  async function openEdit(id: number) {
    const { campaign } = await api.get<{ campaign: Campaign }>(`/api/admin/campaigns/${id}`);
    setEditId(id);
    setDraft({
      name: campaign.name,
      description: campaign.description || "",
      type: campaign.type,
      custom_period_days: campaign.custom_period_days || 3,
      missed_day_behaviour: campaign.missed_day_behaviour,
      qualifying_action: campaign.qualifying_action,
      timezone: campaign.timezone,
      start_date: campaign.start_date || "",
      end_date: campaign.end_date || "",
      active: !!campaign.active,
      latitude: campaign.latitude || null,
      longitude: campaign.longitude || null,
      geofence_radius_m: campaign.geofence_radius_m || null,
      geofence_enabled: !!campaign.geofence_enabled,
      milestones: (campaign.milestones || []).map((m) => ({ streak_count: m.streak_count, reward_id: m.reward_id })),
    });
    setError("");
    setTouched(false);
    setOpen(true);
  }

  function up<K extends keyof Draft>(key: K, val: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: val }));
  }

  function addMilestone() {
    up("milestones", [...draft.milestones, { streak_count: 0, reward_id: rewards[0]?.id || 0 }]);
  }
  function setMilestone(i: number, field: keyof Milestone, val: number) {
    const next = [...draft.milestones];
    next[i] = { ...next[i], [field]: val };
    up("milestones", next);
  }
  function removeMilestone(i: number) {
    up("milestones", draft.milestones.filter((_, idx) => idx !== i));
  }

  async function save() {
    setTouched(true);
    setError("");
    if (invalid) {
      setError("Fix the highlighted fields before saving.");
      focusFirstInvalid();
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...draft,
        name: draft.name.trim(),
        description: draft.description.trim(),
        qualifying_action: draft.qualifying_action.trim(),
        timezone: draft.timezone.trim(),
        custom_period_days: draft.type === "custom" ? draft.custom_period_days : null,
        start_date: draft.start_date || null,
        end_date: draft.end_date || null,
      };
      const saved = editId
        ? await api.put<{ campaign: Campaign }>(`/api/admin/campaigns/${editId}`, payload)
        : await api.post<{ id: number }>("/api/admin/campaigns", payload);
      const id = editId ?? (saved as { id: number }).id;
      await api.put(`/api/admin/campaigns/${id}/milestones`, {
        milestones: draft.milestones.filter((m) => m.streak_count > 0 && m.reward_id > 0),
      });
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this campaign and all its streak data?")) return;
    await api.del(`/api/admin/campaigns/${id}`);
    await load();
  }

  const cadenceHint = draft.type === "daily" ? "one action per calendar day"
    : draft.type === "weekly" ? "one action per week"
    : draft.type === "monthly" ? "one action per month"
    : `one action per ${draft.custom_period_days}-day window`;

  return (
    <>
      <Topbar title="Streak Rules" sub="Campaigns define cadence, missed-day behaviour & milestones"
        action={<button className="btn primary" onClick={openNew}>+ New Campaign</button>} />
      <div className="content">
        {loading ? <div className="loading">Loading…</div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th><th>Cadence</th><th>Missed Day</th><th>Milestones</th>
                  <th>Enrolled</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div className="muted">{c.description || "—"}</div>
                    </td>
                    <td><TypePill type={c.type} />{c.type === "custom" && <span className="muted"> {c.custom_period_days}d</span>}</td>
                    <td>{c.missed_day_behaviour === "break"
                      ? <span className="pill red">Break streak</span>
                      : <span className="pill green">Grace (no break)</span>}</td>
                    <td>{c.milestone_count || 0}</td>
                    <td>{c.enrolled || 0}</td>
                    <td>{c.active ? <span className="pill green">Active</span> : <span className="pill gray">Inactive</span>}</td>
                    <td>
                      <div className="flex">
                        <button className="btn sm ghost" onClick={() => openEdit(c.id)}>Edit</button>
                        <button className="btn sm danger" onClick={() => remove(c.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {campaigns.length === 0 && <tr><td colSpan={7} className="empty">No campaigns yet. Create one to start.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <Modal
          title={editId ? "Edit Campaign" : "New Campaign"}
          onClose={() => setOpen(false)}
          onSubmit={save}
          footer={
            <>
              <button className="btn ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save Campaign"}</button>
            </>
          }
        >
          {error && <div className="error-banner">{error}</div>}
          <Field label="Name" required error={errors.name} touched={touched} counter={`${draft.name.length}/${LIMITS.campaignName}`}>
            <input className="input" value={draft.name} maxLength={LIMITS.campaignName}
              onChange={(e) => up("name", e.target.value)} placeholder="Daily Check-in" />
          </Field>
          <Field label="Description" error={errors.description} touched={touched}
            counter={`${draft.description.length}/${LIMITS.description}`}>
            <textarea className="input" value={draft.description} maxLength={LIMITS.description}
              onChange={(e) => up("description", e.target.value)} />
          </Field>
          <div className="row2">
            <Field label="Campaign Type (cadence)">
              <select className="input" value={draft.type} onChange={(e) => up("type", e.target.value as Campaign["type"])}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom</option>
              </select>
            </Field>
            <Field label="Missed Day Behaviour">
              <select className="input" value={draft.missed_day_behaviour} onChange={(e) => up("missed_day_behaviour", e.target.value as Campaign["missed_day_behaviour"])}>
                <option value="break">Break Streak</option>
                <option value="no_break">Do Not Break (grace)</option>
              </select>
            </Field>
          </div>
          {draft.type === "custom" && (
            <Field label="Custom Period (days)" error={errors.custom_period_days} touched={touched}>
              <input className="input" type="number" min={1} max={3650} value={draft.custom_period_days}
                onChange={(e) => up("custom_period_days", Number(e.target.value))} />
            </Field>
          )}
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={draft.geofence_enabled}
                onChange={(e) => up("geofence_enabled", e.target.checked)} />
              Require geofenced check-in
            </label>
            <div className="muted">
              {draft.geofence_enabled
                ? "Participants must be within the radius below to record an action."
                : "Off — participants can check in from anywhere."}
            </div>
            {draft.geofence_enabled && (
              <div className="row3" style={{ marginTop: 10 }}>
                <Field label="Latitude" error={errors.latitude} touched={touched}>
                  <input className="input" placeholder="-90 to 90" type="number" step="any" min={-90} max={90}
                    value={draft.latitude ?? ""}
                    onChange={(e) => up("latitude", e.target.value === "" ? null : Number(e.target.value))} />
                </Field>
                <Field label="Longitude" error={errors.longitude} touched={touched}>
                  <input className="input" placeholder="-180 to 180" type="number" step="any" min={-180} max={180}
                    value={draft.longitude ?? ""}
                    onChange={(e) => up("longitude", e.target.value === "" ? null : Number(e.target.value))} />
                </Field>
                <Field label="Radius (m)" error={errors.geofence_radius_m} touched={touched}>
                  <input className="input" placeholder="1 to 100000" type="number" min={1} max={100000}
                    value={draft.geofence_radius_m ?? ""}
                    onChange={(e) => up("geofence_radius_m", e.target.value === "" ? null : Number(e.target.value))} />
                </Field>
              </div>
            )}
          </div>
          <div className="row2">
            <Field label="Qualifying Action" error={errors.qualifying_action} touched={touched}>
              <input className="input" value={draft.qualifying_action} maxLength={LIMITS.qualifyingAction}
                onChange={(e) => up("qualifying_action", e.target.value)} placeholder="check_in" />
            </Field>
            <Field label="Timezone" error={errors.timezone} touched={touched} hint="IANA zone, e.g. Asia/Kolkata">
              <input className="input" value={draft.timezone} maxLength={LIMITS.timezone}
                onChange={(e) => up("timezone", e.target.value)} placeholder="Asia/Kolkata" />
            </Field>
          </div>
          <div className="row2">
            <Field label="Start Date" error={errors.start_date} touched={touched}>
              <input className="input" type="date" value={draft.start_date} onChange={(e) => up("start_date", e.target.value)} />
            </Field>
            <Field label="End Date" error={errors.end_date} touched={touched}>
              <input className="input" type="date" min={draft.start_date || undefined}
                value={draft.end_date} onChange={(e) => up("end_date", e.target.value)} />
            </Field>
          </div>
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={draft.active} onChange={(e) => up("active", e.target.checked)} /> Active
            </label>
            <div className="muted">Cadence: {cadenceHint}</div>
          </div>

          <Field
            label="Milestone Rewards (streak count → reward)"
            error={errors.milestones}
            touched={touched}
            hint="Each day can unlock one reward."
          >
            <div>
              {draft.milestones.map((m, i) => (
                <div className="flex" key={i} style={{ marginBottom: 8 }}>
                  <input className="input" type="number" min={1} max={3650} style={{ width: 110 }} placeholder="Day"
                    aria-label={`Milestone ${i + 1} day`}
                    value={m.streak_count || ""} onChange={(e) => setMilestone(i, "streak_count", Number(e.target.value))} />
                  <select className="input" aria-label={`Milestone ${i + 1} reward`} value={m.reward_id}
                    onChange={(e) => setMilestone(i, "reward_id", Number(e.target.value))}>
                    {rewards.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                  </select>
                  <button className="btn sm danger" type="button" aria-label={`Remove milestone ${i + 1}`} onClick={() => removeMilestone(i)}>×</button>
                </div>
              ))}
              <button className="btn sm ghost" type="button" onClick={addMilestone} disabled={rewards.length === 0}>
                {rewards.length === 0 ? "Create a reward first" : "+ Add milestone"}
              </button>
            </div>
          </Field>
        </Modal>
      )}
    </>
  );
}
