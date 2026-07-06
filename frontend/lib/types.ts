export interface Campaign {
  id: number;
  name: string;
  description: string | null;
  type: "daily" | "weekly" | "monthly" | "custom";
  custom_period_days: number | null;
  missed_day_behaviour: "break" | "no_break";
  qualifying_action: string;
  timezone: string;
  start_date: string | null;
  end_date: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_m: number | null;
  geofence_enabled: number;
  active: number;
  enrolled?: number;
  milestone_count?: number;
  milestones?: Milestone[];
}

export interface Milestone {
  id?: number;
  streak_count: number;
  reward_id: number;
  reward_title?: string;
  reward_type?: string;
}

export interface Reward {
  id: number;
  title: string;
  description: string | null;
  type: "coupon" | "points" | "badge" | "custom";
  value: string | null;
  image: string | null;
  validity_days: number | null;
  active: number;
  issued?: number;
  redeemed?: number;
}

export interface BrandProfile {
  brand_name: string;
  tagline: string | null;
  logo: string | null;
  theme_color: string;
  updated_at?: string;
}

export interface Stats {
  active_streaks: number;
  longest_streak: number;
  rewards_issued: number;
  average_streak: number;
  missed_days: number;
  completion_rate: number;
  total_users: number;
  total_campaigns: number;
}

export interface ActivityItem {
  event_type: string;
  streak_count: number | null;
  meta: string | null;
  occurred_at: string;
  user_name: string | null;
  identifier: string;
  campaign_name: string;
}

export interface Analytics {
  daily_active_users: { day: string; users: number }[];
  streak_distribution: { bucket: string; users: number }[];
  milestone_redemption: { streak_count: number; unlocked: number; redeemed: number | null }[];
}

export interface UserRow {
  id: number;
  name: string | null;
  identifier: string;
  created_at: string;
  current_streak: number;
  longest_streak: number;
  missed_days: number;
  rewards_earned: number;
  last_activity: string | null;
}

export interface CalendarEntry {
  id: number;
  date: string;
  note: string | null;
  campaign_id: number | null;
  reward_id: number;
  reward_title: string;
  reward_type: string;
  campaign_name: string | null;
}
