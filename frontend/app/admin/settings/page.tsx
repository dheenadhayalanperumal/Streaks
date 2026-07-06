"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { BrandProfile } from "@/lib/types";
import { Topbar } from "../../components";

interface Draft {
  brand_name: string;
  tagline: string;
  logo: string;
  theme_color: string;
}

const empty: Draft = { brand_name: "", tagline: "", logo: "", theme_color: "#ef5a7f" };

// Lighten a hex color toward white — used to build the accent gradient preview.
function lighten(hex: string, amount = 0.4): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export default function SettingsPage() {
  const [draft, setDraft] = useState<Draft>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    const { brand } = await api.get<{ brand: BrandProfile }>("/api/admin/brand");
    setDraft({
      brand_name: brand.brand_name || "",
      tagline: brand.tagline || "",
      logo: brand.logo || "",
      theme_color: brand.theme_color || "#ef5a7f",
    });
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  function up<K extends keyof Draft>(k: K, v: Draft[K]) {
    setSaved(false);
    setDraft((d) => ({ ...d, [k]: v }));
  }

  function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      setError("Logo must be under 512 KB. Try a smaller image.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => up("logo", String(reader.result));
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const color = /^#[0-9a-fA-F]{6}$/.test(draft.theme_color)
        ? draft.theme_color
        : "#ef5a7f";
      await api.put("/api/admin/brand", {
        brand_name: draft.brand_name,
        tagline: draft.tagline || null,
        logo: draft.logo || null,
        theme_color: color,
      });
      setSaved(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const grad = `linear-gradient(90deg, ${draft.theme_color}, ${lighten(draft.theme_color)})`;
  const initials =
    draft.brand_name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "S";

  return (
    <>
      <Topbar
        title="Brand Profile"
        sub="Set the name, tagline, logo and theme colour shown on the customer check-in page"
        action={
          <button className="btn primary" onClick={save} disabled={saving || loading}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        }
      />
      <div className="content">
        {loading ? (
          <div className="loading">Loading…</div>
        ) : (
          <div
            className="grid"
            style={{ gridTemplateColumns: "minmax(320px, 1fr) 360px", alignItems: "start", gap: 20 }}
          >
            {/* ---- Editor ---- */}
            <div className="card">
              {error && <div className="error-banner">{error}</div>}
              {saved && !error && (
                <div
                  className="pill green"
                  style={{ marginBottom: 14, display: "inline-block" }}
                >
                  Saved — the check-in page updates instantly
                </div>
              )}

              <div className="field">
                <label>Brand Name</label>
                <input
                  className="input"
                  value={draft.brand_name}
                  placeholder="e.g. FlipFeed"
                  onChange={(e) => up("brand_name", e.target.value)}
                />
              </div>

              <div className="field">
                <label>Brand Tagline</label>
                <input
                  className="input"
                  value={draft.tagline}
                  placeholder="Show up daily. Don't break the chain."
                  onChange={(e) => up("tagline", e.target.value)}
                />
              </div>

              <div className="field">
                <label>Logo</label>
                <div className="flex" style={{ gap: 12, alignItems: "center" }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 12,
                      overflow: "hidden",
                      display: "grid",
                      placeItems: "center",
                      background: draft.logo ? "#fff" : grad,
                      color: "#fff",
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {draft.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={draft.logo}
                        alt="logo"
                        style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      />
                    ) : (
                      initials
                    )}
                  </div>
                  <button className="btn ghost sm" onClick={() => fileRef.current?.click()}>
                    Upload image
                  </button>
                  {draft.logo && (
                    <button className="btn ghost sm" onClick={() => up("logo", "")}>
                      Remove
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={onPickLogo}
                  />
                </div>
                <div className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>
                  PNG, JPG or SVG under 512 KB. Or paste an image URL below.
                </div>
                <input
                  className="input"
                  style={{ marginTop: 8 }}
                  value={draft.logo.startsWith("data:") ? "" : draft.logo}
                  placeholder="https://…/logo.png"
                  onChange={(e) => up("logo", e.target.value)}
                />
              </div>

              <div className="field">
                <label>Theme Colour</label>
                <div className="flex" style={{ gap: 12, alignItems: "center" }}>
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(draft.theme_color) ? draft.theme_color : "#ef5a7f"}
                    onChange={(e) => up("theme_color", e.target.value)}
                    style={{
                      width: 48,
                      height: 40,
                      padding: 0,
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      background: "none",
                      cursor: "pointer",
                    }}
                  />
                  <input
                    className="input"
                    style={{ maxWidth: 160, textTransform: "lowercase" }}
                    value={draft.theme_color}
                    onChange={(e) => up("theme_color", e.target.value)}
                  />
                  <span
                    style={{
                      flex: 1,
                      height: 40,
                      borderRadius: 8,
                      background: grad,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* ---- Live preview ---- */}
            <div
              className="card"
              style={{
                background: "#0a0a0d",
                border: "1px solid #23232c",
                overflow: "hidden",
              }}
            >
              <div
                className="muted"
                style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 16 }}
              >
                Check-in page preview
              </div>

              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 14,
                  }}
                >
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 12,
                      overflow: "hidden",
                      display: "grid",
                      placeItems: "center",
                      background: draft.logo ? "#fff" : grad,
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    {draft.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={draft.logo}
                        alt="logo"
                        style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      />
                    ) : (
                      initials
                    )}
                  </div>
                  <div style={{ textAlign: "left", color: "#f3f0ef" }}>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>
                      {draft.brand_name || "Your Brand"}
                    </div>
                    <div style={{ fontSize: 12.5, color: "#9a97a3" }}>
                      {draft.tagline || "Your tagline appears here"}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 40, fontWeight: 800, color: "#f3f0ef", lineHeight: 1 }}>
                  <span>🔥</span>{" "}
                  <span style={{ color: draft.theme_color }}>7</span>
                </div>
                <div style={{ color: "#9a97a3", fontSize: 13, margin: "6px 0 18px" }}>
                  Your Daily Streak
                </div>

                <div className="flex" style={{ justifyContent: "center", gap: 8, marginBottom: 18 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span
                      key={n}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        display: "grid",
                        placeItems: "center",
                        fontSize: 12,
                        color: n <= 3 ? "#fff" : "#6a6773",
                        background: n <= 3 ? grad : "rgba(255,255,255,0.06)",
                      }}
                    >
                      {n}
                    </span>
                  ))}
                </div>

                <button
                  style={{
                    width: "100%",
                    height: 48,
                    border: "none",
                    borderRadius: 26,
                    background: grad,
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: "default",
                  }}
                >
                  Check in Today
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
