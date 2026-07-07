// Shared WhatsApp helpers for the admin panel — mirrors the backend token
// substitution so the live preview matches exactly what gets sent.

export const TOKENS = ["[Name]", "[Business Name]", "[Prize]", "[CODE]", "[Days]"] as const;

export interface Segment {
  id: "all" | "redeemed" | "unused" | "non-redeemed";
  label: string;
  desc: string;
}

export const SEGMENTS: Segment[] = [
  { id: "all", label: "All participants", desc: "Everyone registered (minus opt-outs)." },
  { id: "redeemed", label: "Redeemed", desc: "Have redeemed at least one reward." },
  { id: "unused", label: "Unused reward", desc: "Hold a live reward they haven't redeemed yet." },
  { id: "non-redeemed", label: "Non-redeemed", desc: "Have never redeemed any reward." },
];

const sampleVars = (brandName?: string): Record<string, string> => ({
  "[Name]": "Ravi",
  "[Business Name]": brandName || "our store",
  "[Prize]": "Free Coffee",
  "[CODE]": "STREAK-7K2M",
  "[Days]": "14",
});

/** Render a body with sample values so the admin sees a realistic preview. */
export function renderPreview(body: string, brandName?: string): string {
  let text = body || "";
  for (const [token, value] of Object.entries(sampleVars(brandName))) {
    text = text.split(token).join(value);
  }
  return text;
}
