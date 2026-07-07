"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { WaTemplate, WaStatus, WaRecipient, BroadcastResult, BrandProfile } from "@/lib/types";
import { SEGMENTS, renderPreview } from "@/lib/wa";
import { Topbar } from "../../components";

export default function PromotionsPage() {
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [brand, setBrand] = useState("our store");
  const [loading, setLoading] = useState(true);

  const [segment, setSegment] = useState<string>("all");
  const [message, setMessage] = useState("");
  const [recipients, setRecipients] = useState<WaRecipient[]>([]);
  const [counting, setCounting] = useState(false);

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const [t, st, b] = await Promise.all([
      api.get<{ templates: WaTemplate[] }>("/api/admin/whatsapp/templates"),
      api.get<WaStatus>("/api/admin/whatsapp/status"),
      api.get<{ brand: BrandProfile }>("/api/admin/brand"),
    ]);
    setTemplates(t.templates);
    setStatus(st);
    setBrand(b.brand.brand_name || "our store");
    if (t.templates[0]) setMessage(t.templates[0].body);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function loadRecipients(seg: string) {
    setCounting(true);
    try {
      const r = await api.get<{ count: number; recipients: WaRecipient[] }>(
        `/api/admin/whatsapp/recipients?segment=${encodeURIComponent(seg)}`
      );
      setRecipients(r.recipients);
    } finally {
      setCounting(false);
    }
  }
  useEffect(() => {
    loadRecipients(segment);
    setResult(null);
  }, [segment]);

  function pickTemplate(name: string) {
    const t = templates.find((x) => x.name === name);
    if (t) setMessage(t.body);
  }

  async function send() {
    if (!status?.enabled) {
      setError("WhatsApp delivery is disabled. Enable it on the WhatsApp page first.");
      return;
    }
    if (!confirm(`Send this promotion to ${recipients.length} recipient(s) in the "${segment}" segment?`)) return;
    setSending(true);
    setError("");
    setResult(null);
    try {
      const { result } = await api.post<{ result: BroadcastResult }>("/api/admin/whatsapp/broadcast", {
        segment,
        message,
      });
      setResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Broadcast failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Topbar
        title="Promotion Messages"
        sub="Broadcast a template to an audience segment over WhatsApp"
        action={
          <button className="btn primary" onClick={send} disabled={sending || loading || !message.trim()}>
            {sending ? "Sending…" : `Send to ${recipients.length}`}
          </button>
        }
      />
      <div className="content">
        {loading ? (
          <div className="loading">Loading…</div>
        ) : (
          <>
            {error && <div className="error-banner">{error}</div>}
            {!status?.enabled && (
              <div className="card" style={{ marginBottom: 18, borderColor: "var(--brand)" }}>
                <div className="flex" style={{ gap: 10, alignItems: "center" }}>
                  <span className="pill orange">Delivery disabled</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    Broadcasts won&apos;t send until WhatsApp delivery is enabled on the WhatsApp page.
                  </span>
                </div>
              </div>
            )}

            {result && (
              <div className="card" style={{ marginBottom: 18 }}>
                <div className="section-title" style={{ marginBottom: 12 }}>Broadcast result</div>
                <div className="flex" style={{ gap: 10, flexWrap: "wrap" }}>
                  <span className="pill gray">Total {result.total}</span>
                  <span className="pill green">Sent {result.sent}</span>
                  <span className="pill blue">Simulated {result.simulated}</span>
                  <span className="pill red">Failed {result.failed}</span>
                  <span className="pill orange">Skipped {result.skipped}</span>
                </div>
              </div>
            )}

            <div className="grid" style={{ gridTemplateColumns: "minmax(340px, 1fr) 360px", alignItems: "start", gap: 20 }}>
              {/* ---- Compose ---- */}
              <div className="card">
                <div className="section-title" style={{ marginBottom: 14 }}>Compose</div>

                <div className="field">
                  <label>Start from template</label>
                  <select className="input" defaultValue="" onChange={(e) => pickTemplate(e.target.value)}>
                    <option value="" disabled>Choose a template…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>Message <span className="muted">({message.length}/1024)</span></label>
                  <textarea
                    className="input"
                    rows={6}
                    maxLength={1024}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Hi [Name]! …"
                  />
                </div>

                <div className="field">
                  <label>Preview</label>
                  <div
                    style={{
                      fontSize: 13,
                      whiteSpace: "pre-wrap",
                      background: "var(--surface-2, rgba(255,255,255,0.04))",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: 12,
                      minHeight: 40,
                    }}
                  >
                    {renderPreview(message, brand) || <span className="muted">Nothing to preview yet.</span>}
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Sent as free-form text — reaches users inside the 24-hour service window. For cold marketing blasts,
                  use an approved marketing template.
                </div>
              </div>

              {/* ---- Audience ---- */}
              <div className="card">
                <div className="section-title" style={{ marginBottom: 14 }}>Audience</div>
                <div className="stack" style={{ display: "grid", gap: 8 }}>
                  {SEGMENTS.map((s) => (
                    <label
                      key={s.id}
                      className="card"
                      style={{
                        padding: 12,
                        cursor: "pointer",
                        borderColor: segment === s.id ? "var(--brand)" : "var(--border)",
                      }}
                    >
                      <div className="flex" style={{ gap: 10, alignItems: "flex-start" }}>
                        <input
                          type="radio"
                          name="segment"
                          checked={segment === s.id}
                          onChange={() => setSegment(s.id)}
                          style={{ marginTop: 3 }}
                        />
                        <div>
                          <div style={{ fontWeight: 600 }}>{s.label}</div>
                          <div className="muted" style={{ fontSize: 12 }}>{s.desc}</div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="flex" style={{ justifyContent: "space-between", marginTop: 14, alignItems: "center" }}>
                  <span className="muted" style={{ fontSize: 12.5 }}>Recipients (minus opt-outs)</span>
                  <span className="pill green" style={{ fontSize: 14 }}>
                    {counting ? "…" : recipients.length}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
