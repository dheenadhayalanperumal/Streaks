// Customer-facing API client. Participants are identified by their mobile
// number, sent as the `X-User-Identifier` header on every request. This is
// deliberately separate from lib/api.ts (which carries the admin Bearer token
// and force-redirects to /login on 401).

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080";
const STORE_KEY = "streaks_customer";

export interface Customer {
  identifier: string; // e.g. "+919876543210"
  name: string;
  campaignId: number;
}

export function getCustomer(): Customer | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Customer;
  } catch {
    return null;
  }
}

export function setCustomer(c: Customer) {
  localStorage.setItem(STORE_KEY, JSON.stringify(c));
}

export function clearCustomer() {
  localStorage.removeItem(STORE_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T>(
  path: string,
  identifier: string | null,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (identifier) headers["X-User-Identifier"] = identifier;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

// ---- Response shapes ------------------------------------------------------

export interface BrandProfile {
  brand_name: string;
  tagline: string | null;
  logo: string | null;
  theme_color: string;
}

export interface ActiveMilestone {
  streak_count: number;
  title: string;
  type: "coupon" | "points" | "badge" | "custom";
  value: string | null;
}

export interface ActiveCampaign {
  id: number;
  name: string;
  description: string | null;
  type: "daily" | "weekly" | "monthly" | "custom";
  qualifying_action: string;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  geofence_enabled: number;
  milestones: ActiveMilestone[];
}

export interface StreakState {
  campaign_id: number;
  campaign_name: string;
  type: string;
  current_count: number | null;
  longest_count: number | null;
  missed_count: number | null;
  status: string | null;
  last_completed_at: string | null;
}

export interface RewardIssue {
  id: number;
  code: string;
  status: "unlocked" | "redeemed" | "expired";
  issued_at: string;
  expires_at: string | null;
  title: string;
  description: string | null;
  type: "coupon" | "points" | "badge" | "custom";
  value: string | null;
  image: string | null;
}

export interface ActionResult {
  ok: boolean;
  user_id: number;
  status: "advanced" | "already_completed" | "reset_then_advanced";
  current_count: number;
  reward: {
    reward_id: number;
    title: string;
    type: string;
    value: string | null;
    code: string;
    milestone: number;
  } | null;
}

// ---- Endpoints ------------------------------------------------------------

export const customerApi = {
  brand: () => req<{ brand: BrandProfile }>("/api/brand", null),

  activeCampaigns: () =>
    req<{ campaigns: ActiveCampaign[] }>("/api/campaigns/active", null),

  enroll: (identifier: string, name: string, campaignId: number) =>
    req<{ enrollment_id: number; user_id: number; campaign_id: number }>(
      "/api/enroll",
      identifier,
      { method: "POST", body: JSON.stringify({ identifier, name, campaign_id: campaignId }) },
    ),

  action: (
    identifier: string,
    campaignId: number,
    lat?: number,
    lng?: number,
    idempotencyKey?: string,
  ) =>
    req<ActionResult>("/api/action", identifier, {
      method: "POST",
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
      body: JSON.stringify({ campaign_id: campaignId, latitude: lat, longitude: lng }),
    }),

  myStreaks: (identifier: string) =>
    req<{ user_id: number; streaks: StreakState[] }>("/api/me/streaks", identifier),

  myRewards: (identifier: string) =>
    req<{ user_id: number; rewards: RewardIssue[] }>("/api/me/rewards", identifier),

  redeem: (identifier: string, rewardIssueId: number) =>
    req<{ ok: boolean; status: string }>(`/api/rewards/${rewardIssueId}/redeem`, identifier, {
      method: "POST",
    }),
};
