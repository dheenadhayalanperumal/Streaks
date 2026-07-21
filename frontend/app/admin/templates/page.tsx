"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { WaTemplate, BrandProfile } from "@/lib/types";
import { TOKENS, renderPreview } from "@/lib/wa";
import { Topbar, Modal, Field, focusFirstInvalid } from "../../components";
import { LIMITS, type Errors, hasErrors, maxLen, required, templateName } from "@/lib/validation";

interface Draft {
  name: string;
  body: string;
}
const empty: Draft = { name: "", body: "" };

function validate(d: Draft): Errors {
  return {
    name: templateName(d.name),
    body: required("Body", d.body) || maxLen("Body", d.body, LIMITS.templateBody),
  };
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [brand, setBrand] = useState<string>("our store");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);

  const errors = useMemo(() => validate(draft), [draft]);
  const invalid = hasErrors(errors);

  async function load() {
    const [t, b] = await Promise.all([
      api.get<{ templates: WaTemplate[] }>("/api/admin/whatsapp/templates"),
      api.get<{ brand: BrandProfile }>("/api/admin/brand"),
    ]);
    setTemplates(t.templates);
    setBrand(b.brand.brand_name || "our store");
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setEditId(null);
    setDraft(empty);
    setError("");
    setTouched(false);
    setOpen(true);
  }
  function openEdit(t: WaTemplate) {
    setEditId(t.id);
    setDraft({ name: t.name, body: t.body });
    setError("");
    setTouched(false);
    setOpen(true);
  }

  function insertToken(token: string) {
    setDraft((d) => ({ ...d, body: (d.body ? d.body + " " : "") + token }));
  }

  async function save() {
    setTouched(true);
    if (invalid) {
      setError("Fix the highlighted fields before saving.");
      focusFirstInvalid();
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = { name: draft.name.trim(), body: draft.body.trim() };
      if (editId) await api.put(`/api/admin/whatsapp/templates/${editId}`, payload);
      else await api.post("/api/admin/whatsapp/templates", payload);
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this template?")) return;
    await api.del(`/api/admin/whatsapp/templates/${id}`);
    await load();
  }

  return (
    <>
      <Topbar
        title="Message Templates"
        sub="Reusable WhatsApp message bodies with [Bracket] tokens filled in per recipient"
        action={<button className="btn primary" onClick={openNew}>+ New Template</button>}
      />
      <div className="content">
        {loading ? (
          <div className="loading">Loading…</div>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
            {templates.map((t) => (
              <div className="card" key={t.id}>
                <div className="flex" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span className="pill blue" style={{ fontFamily: "monospace" }}>{t.name}</span>
                  <div className="flex">
                    <button className="btn sm ghost" onClick={() => openEdit(t)}>Edit</button>
                    <button className="btn sm danger" onClick={() => remove(t.id)}>×</button>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-dim)", whiteSpace: "pre-wrap", minHeight: 60 }}>{t.body}</div>
                <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 12 }}>
                  <div className="muted" style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                    Preview
                  </div>
                  <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{renderPreview(t.body, brand)}</div>
                </div>
              </div>
            ))}
            {templates.length === 0 && <div className="empty">No templates yet.</div>}
          </div>
        )}
      </div>

      {open && (
        <Modal
          title={editId ? "Edit Template" : "New Template"}
          onClose={() => setOpen(false)}
          onSubmit={save}
          footer={
            <>
              <button className="btn ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save Template"}</button>
            </>
          }
        >
          {error && <div className="error-banner">{error}</div>}
          <Field
            label="Name"
            required
            error={errors.name}
            touched={touched}
            hint="Spaces become underscores, lowercased."
            counter={`${draft.name.length}/${LIMITS.templateName}`}
          >
            <input
              className="input"
              value={draft.name}
              maxLength={LIMITS.templateName}
              placeholder="streak_reward"
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </Field>
          <Field label="Body" required error={errors.body} touched={touched} counter={`${draft.body.length}/${LIMITS.templateBody}`}>
            <div>
              <textarea
                className="input"
                rows={5}
                maxLength={LIMITS.templateBody}
                value={draft.body}
                placeholder="Hey [Name]! You unlocked [Prize]. Use code [CODE]…"
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              />
              <div className="flex" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {TOKENS.map((tok) => (
                  <button key={tok} type="button" className="btn sm ghost" style={{ fontFamily: "monospace" }} onClick={() => insertToken(tok)}>
                    {tok}
                  </button>
                ))}
              </div>
            </div>
          </Field>
          <div className="field">
            <span className="field-label">Preview</span>
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
              {renderPreview(draft.body, brand) || <span className="muted">Nothing to preview yet.</span>}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
