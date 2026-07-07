"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { WaSettings, WaStatus, WaOptOut, WaTemplate } from "@/lib/types";
import { Topbar } from "../../components";

export default function WhatsAppPage() {
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [draft, setDraft] = useState<WaSettings>({
    wa_enabled: false,
    wa_phone_number_id: "",
    wa_template_name: "streak_reward",
    wa_template_body: "",
  });
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [optouts, setOptouts] = useState<WaOptOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Test send
  const [testMobile, setTestMobile] = useState("");
  const [testName, setTestName] = useState("");
  const [testResult, setTestResult] = useState<string>("");

  // Opt-out add
  const [newOptOut, setNewOptOut] = useState("");

  async function load() {
    const [s, st, t, o] = await Promise.all([
      api.get<{ settings: WaSettings; mode: string }>("/api/admin/whatsapp/settings"),
      api.get<WaStatus>("/api/admin/whatsapp/status"),
      api.get<{ templates: WaTemplate[] }>("/api/admin/whatsapp/templates"),
      api.get<{ optouts: WaOptOut[] }>("/api/admin/whatsapp/optouts"),
    ]);
    setDraft({
      wa_enabled: s.settings.wa_enabled,
      wa_phone_number_id: s.settings.wa_phone_number_id || "",
      wa_template_name: s.settings.wa_template_name || "streak_reward",
      wa_template_body: s.settings.wa_template_body || "",
    });
    setStatus(st);
    setTemplates(t.templates);
    setOptouts(o.optouts);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  function up<K extends keyof WaSettings>(k: K, v: WaSettings[K]) {
    setSaved(false);
    setDraft((d) => ({ ...d, [k]: v }));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await api.put("/api/admin/whatsapp/settings", {
        wa_enabled: draft.wa_enabled,
        wa_phone_number_id: draft.wa_phone_number_id || null,
        wa_template_name: draft.wa_template_name,
        wa_template_body: draft.wa_template_body || null,
      });
      setSaved(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTestResult("");
    setError("");
    try {
      const { result } = await api.post<{ result: { status: string; text: string; error?: string } }>(
        "/api/admin/whatsapp/test",
        { mobile: testMobile, name: testName }
      );
      setTestResult(
        `${result.status.toUpperCase()}${result.error ? " — " + result.error : ""}${
          result.text ? "\n\n" + result.text : ""
        }`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    }
  }

  async function addOptOut() {
    if (!newOptOut.trim()) return;
    setError("");
    try {
      await api.post("/api/admin/whatsapp/optouts", { mobile: newOptOut });
      setNewOptOut("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add opt-out");
    }
  }

  async function releaseOptOut(mobile: string) {
    await api.del(`/api/admin/whatsapp/optouts/${encodeURIComponent(mobile)}`);
    await load();
  }

  return (
    <>
      <Topbar
        title="WhatsApp Integration"
        sub="Deliver streak rewards and promotions over WhatsApp Business Cloud"
        action={
          <button className="btn primary" onClick={save} disabled={saving || loading}>
            {saving ? "Saving…" : "Save Settings"}
          </button>
        }
      />
      <div className="content">
        {loading ? (
          <div className="loading">Loading…</div>
        ) : (
          <>
            {error && <div className="error-banner">{error}</div>}

            {/* Mode banner */}
            <div className="card" style={{ marginBottom: 18 }}>
              <div className="flex" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div className="flex" style={{ gap: 10, alignItems: "center" }}>
                  <span className={`pill ${status?.mode === "live" ? "green" : "orange"}`}>
                    {status?.mode === "live" ? "Live delivery" : "Simulation mode"}
                  </span>
                  <span className={`pill ${draft.wa_enabled ? "green" : "gray"}`}>
                    {draft.wa_enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="muted" style={{ fontSize: 12.5, maxWidth: 520 }}>
                  {status?.mode === "live"
                    ? "Credentials are configured — messages are sent through Meta."
                    : "No API token / phone-number id in the environment. Messages are logged to the server console instead of being sent."}
                </div>
              </div>
            </div>

            <div className="grid" style={{ gridTemplateColumns: "minmax(340px, 1fr) 360px", alignItems: "start", gap: 20 }}>
              {/* ---- Delivery settings ---- */}
              <div className="card">
                <div className="section-title" style={{ marginBottom: 14 }}>Delivery settings</div>
                {saved && !error && (
                  <div className="pill green" style={{ marginBottom: 14, display: "inline-block" }}>Saved</div>
                )}

                <div className="field">
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={draft.wa_enabled} onChange={(e) => up("wa_enabled", e.target.checked)} />
                    Enable WhatsApp delivery for this client
                  </label>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                    Master on/off. When off, nothing is sent or simulated.
                  </div>
                </div>

                <div className="field">
                  <label>Phone Number ID <span className="muted">(optional — overrides env)</span></label>
                  <input
                    className="input"
                    value={draft.wa_phone_number_id || ""}
                    placeholder="From Meta › WhatsApp › API setup"
                    onChange={(e) => up("wa_phone_number_id", e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Reward template</label>
                  <select
                    className="input"
                    value={draft.wa_template_name}
                    onChange={(e) => up("wa_template_name", e.target.value)}
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                    {!templates.some((t) => t.name === draft.wa_template_name) && (
                      <option value={draft.wa_template_name}>{draft.wa_template_name}</option>
                    )}
                  </select>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                    Which library template is sent when a streak reward unlocks. Manage the copy under Templates.
                  </div>
                </div>

                <div className="field">
                  <label>Fallback body <span className="muted">(used if no library template matches)</span></label>
                  <textarea
                    className="input"
                    rows={3}
                    value={draft.wa_template_body || ""}
                    placeholder="Hey [Name]! You unlocked [Prize]…"
                    onChange={(e) => up("wa_template_body", e.target.value)}
                  />
                </div>
              </div>

              {/* ---- Test send ---- */}
              <div className="card">
                <div className="section-title" style={{ marginBottom: 14 }}>Send a test</div>
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
                  Sends a sample reward message using the current settings. In simulation mode it is logged, not delivered.
                </div>
                <div className="field">
                  <label>Mobile</label>
                  <input className="input" value={testMobile} placeholder="9876543210" onChange={(e) => setTestMobile(e.target.value)} />
                </div>
                <div className="field">
                  <label>Name</label>
                  <input className="input" value={testName} placeholder="Ravi" onChange={(e) => setTestName(e.target.value)} />
                </div>
                <button className="btn primary" style={{ width: "100%", justifyContent: "center" }} onClick={sendTest} disabled={!testMobile.trim()}>
                  Send test message
                </button>
                {testResult && (
                  <pre
                    style={{
                      marginTop: 12,
                      whiteSpace: "pre-wrap",
                      fontSize: 12.5,
                      background: "var(--surface-2, rgba(255,255,255,0.04))",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: 12,
                    }}
                  >
                    {testResult}
                  </pre>
                )}
              </div>
            </div>

            {/* ---- Opt-outs ---- */}
            <div className="card" style={{ marginTop: 20 }}>
              <div className="flex" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div className="section-title">Opt-outs ({optouts.length})</div>
                <div className="flex" style={{ gap: 8 }}>
                  <input
                    className="input"
                    style={{ width: 180 }}
                    value={newOptOut}
                    placeholder="Add mobile…"
                    onChange={(e) => setNewOptOut(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addOptOut()}
                  />
                  <button className="btn ghost sm" onClick={addOptOut}>Add</button>
                </div>
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
                Numbers that replied STOP (or added here) are never messaged again. Broadcasts and rewards skip them automatically.
              </div>
              {optouts.length === 0 ? (
                <div className="empty">No opt-outs.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Mobile</th>
                        <th>Since</th>
                        <th style={{ width: 80 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {optouts.map((o) => (
                        <tr key={o.mobile}>
                          <td>{o.mobile}</td>
                          <td className="muted">{o.created_at}</td>
                          <td>
                            <button className="btn sm ghost" onClick={() => releaseOptOut(o.mobile)}>Release</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
