// Resolves the API origin at runtime so the same static build works on any
// host without recompiling.
//
// Priority:
//   1. window.__API_BASE__  — set in /config.js, editable after deploy.
//      A non-empty value (e.g. "https://api.example.com") wins. An empty
//      string means "use the build default" (same-origin relative /api).
//   2. NEXT_PUBLIC_API_BASE — build-time env (used by local dev via .env.local).
//   3. "" — same origin: fetch("/api/...") hits the API mounted under /api.
export function apiBase(): string {
  if (typeof window !== "undefined") {
    const w = window as unknown as { __API_BASE__?: string };
    if (typeof w.__API_BASE__ === "string" && w.__API_BASE__.length > 0) {
      return w.__API_BASE__.replace(/\/$/, "");
    }
  }
  return (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");
}
