"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  customerApi,
  getCustomer,
  setCustomer,
  clearCustomer,
  type ActiveCampaign,
  type StreakState,
  type RewardIssue,
  type BrandProfile,
} from "@/lib/customer";
import {
  Hero,
  HowItWorks,
  MilestoneList,
  RewardModal,
  StreakModal,
  ErrorModal,
  rewardIcon,
} from "./ui";

type Step = "signup" | "otp" | "dashboard";
type Modal =
  | { kind: "reward"; title: string; code: string; icon: string }
  | { kind: "streak"; day: number }
  | { kind: "error"; title: string; message: string }
  | null;

export default function StreakPage() {
  const [step, setStep] = useState<Step>("signup");
  const [booting, setBooting] = useState(true);

  const [campaign, setCampaign] = useState<ActiveCampaign | null>(null);
  const [brand, setBrand] = useState<BrandProfile | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [streak, setStreak] = useState<StreakState | null>(null);
  const [rewards, setRewards] = useState<RewardIssue[]>([]);
  const [modal, setModal] = useState<Modal>(null);

  const identifier = phone ? `+91${phone}` : "";

  // ---- boot: load active campaign + restore returning participant ----
  useEffect(() => {
    (async () => {
      // Brand profile is independent of campaign availability — load it first
      // so the page reflects the admin's branding even if the API is otherwise
      // quiet.
      try {
        const { brand: b } = await customerApi.brand();
        setBrand(b);
      } catch {
        /* keep default theme */
      }
      try {
        const { campaigns } = await customerApi.activeCampaigns();
        const primary =
          campaigns.find((c) => c.type === "daily") || campaigns[0] || null;
        setCampaign(primary);

        const saved = getCustomer();
        if (saved && primary) {
          setName(saved.name);
          setPhone(saved.identifier.replace(/^\+91/, ""));
          setStep("dashboard");
          await loadDashboard(saved.identifier, primary.id);
        }
      } catch {
        /* API offline — signup screen still renders */
      } finally {
        setBooting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- apply the admin's theme colour to the whole check-in UI ----
  useEffect(() => {
    const color = brand?.theme_color;
    if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return;
    // The accent vars are declared on `.ccd`; setting inline properties on that
    // same element overrides the stylesheet and cascades to every child + modal.
    const el = document.querySelector<HTMLElement>(".ccd");
    if (!el) return;
    const soft = lighten(color, 0.35);
    el.style.setProperty("--gold", color);
    el.style.setProperty("--rose", color);
    el.style.setProperty("--pink-label", color);
    el.style.setProperty("--amber", soft);
    el.style.setProperty("--grad", `linear-gradient(90deg, ${color}, ${soft})`);
    el.style.setProperty(
      "--grad-soft",
      `linear-gradient(90deg, ${hexA(color, 0.16)}, ${hexA(soft, 0.14)})`,
    );
  }, [brand?.theme_color]);

  async function loadDashboard(id: string, campaignId: number) {
    const [{ streaks }, { rewards: rw }] = await Promise.all([
      customerApi.myStreaks(id),
      customerApi.myRewards(id),
    ]);
    setStreak(streaks.find((s) => s.campaign_id === campaignId) || null);
    setRewards(rw);
  }

  // ---- signup ----
  function submitSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (name.trim().length < 2) return setError("Please enter your name.");
    if (!/^\d{10}$/.test(phone)) return setError("Enter a valid 10-digit mobile number.");
    // No OTP backend — we simulate delivery and advance to the verify screen.
    setStep("otp");
  }

  // ---- otp verify -> enroll -> dashboard ----
  async function verifyOtp(codeOk: boolean) {
    setError("");
    if (!codeOk) return setError("Enter the 4-digit code we sent you.");
    if (!campaign) return setError("No active campaign right now. Try again later.");
    setBusy(true);
    try {
      await customerApi.enroll(identifier, name.trim(), campaign.id);
      setCustomer({ identifier, name: name.trim(), campaignId: campaign.id });
      await loadDashboard(identifier, campaign.id);
      setStep("dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign you in.");
    } finally {
      setBusy(false);
    }
  }

  // ---- check in ----
  async function checkIn() {
    if (!campaign) return;
    setBusy(true);
    setError("");

    function proceed(lat?: number, lng?: number) {
      customerApi.action(identifier, campaign!.id, lat, lng).then(async (res) => {
        await loadDashboard(identifier, campaign!.id);
        if (res.reward) {
          setModal({
            kind: "reward",
            title: res.reward.title,
            code: formatCode(res.reward.code),
            icon: rewardIcon(res.reward.type, res.reward.title),
          });
        } else {
          setModal({ kind: "streak", day: res.current_count });
        }
      }).catch((err) => {
        const message = err instanceof Error ? err.message : "Check-in failed.";
        setModal({ kind: "error", title: "Check-in Failed", message });
      }).finally(() => {
        setBusy(false);
      });
    }

    if (campaign.geofence_enabled && campaign.latitude != null && campaign.longitude != null) {
      navigator.geolocation.getCurrentPosition(
        (pos) => proceed(pos.coords.latitude, pos.coords.longitude),
        (err) => {
          const message = `Location permission denied. Please enable it in your browser settings to check in. (${err.message})`;
          setModal({ kind: "error", title: "Location Error", message });
          setBusy(false);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    } else {
      proceed();
    }
  }

  function logout() {
    clearCustomer();
    setStep("signup");
    setStreak(null);
    setRewards([]);
    setName("");
    setPhone("");
    setError("");
  }

  if (booting) {
    return (
      <div className="ccd-center">
        <div className="ccd-spinner" />
      </div>
    );
  }

  return (
    <>
      <main className="ccd-body">
        {step === "signup" && (
          <SignupView
            brand={brand}
            name={name}
            phone={phone}
            error={error}
            onName={setName}
            onPhone={setPhone}
            onSubmit={submitSignup}
          />
        )}

        {step === "otp" && (
          <OtpView
            brand={brand}
            identifier={identifier}
            error={error}
            busy={busy}
            onEdit={() => {
              setStep("signup");
              setError("");
            }}
            onVerify={verifyOtp}
          />
        )}

        {step === "dashboard" && campaign && (
          <DashboardView
            brand={brand}
            campaign={campaign}
            streak={streak}
            rewards={rewards}
            busy={busy}
            error={error}
            onCheckIn={checkIn}
            onLogout={logout}
            onOpenReward={(r) =>
              setModal({
                kind: "reward",
                title: r.title,
                code: formatCode(r.code),
                icon: rewardIcon(r.type, r.title),
              })
            }
          />
        )}
      </main>

      {modal?.kind === "reward" && (
        <RewardModal
          title={modal.title}
          code={modal.code}
          icon={modal.icon}
          onDone={() => setModal(null)}
        />
      )}
      {modal?.kind === "streak" && (
        <StreakModal day={modal.day} onDone={() => setModal(null)} />
      )}
      {modal?.kind === "error" && (
        <ErrorModal
          title={modal.title}
          message={modal.message}
          onDone={() => setModal(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- Signup ----
function SignupView({
  brand,
  name,
  phone,
  error,
  onName,
  onPhone,
  onSubmit,
}: {
  brand: BrandProfile | null;
  name: string;
  phone: string;
  error: string;
  onName: (v: string) => void;
  onPhone: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <>
      <BrandBadge brand={brand} />
      <Hero
        title="Your Streak "
        gold="Reward Awaits"
        sub={
          brand?.tagline ||
          "Show up daily. Win bigger. Don't break the chain — claim the reward."
        }
      />
      <form className="ccd-card ccd-in d2" onSubmit={onSubmit}>
        <div className="ccd-eyebrow">
          <span className="label">One step away</span>
        </div>
        {error && <div className="ccd-error">{error}</div>}
        <div className="ccd-field">
          <label>Your Name</label>
          <input
            className="ccd-input"
            placeholder="Enter Your Name"
            value={name}
            onChange={(e) => onName(e.target.value)}
            autoComplete="name"
          />
        </div>
        <div className="ccd-field">
          <label>Mobile Number</label>
          <div className="ccd-phone">
            <span className="cc">+91</span>
            <input
              inputMode="numeric"
              placeholder="00000 00000"
              value={phone}
              maxLength={10}
              onChange={(e) => onPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              autoComplete="tel-national"
            />
          </div>
        </div>
        <button className="ccd-btn" type="submit">
          Send OTP
        </button>
        <p className="ccd-help">We'll text a one-time code. No spam, ever.</p>
      </form>
      <HowItWorks />
    </>
  );
}

// ------------------------------------------------------------------- OTP ----
function OtpView({
  brand,
  identifier,
  error,
  busy,
  onEdit,
  onVerify,
}: {
  brand: BrandProfile | null;
  identifier: string;
  error: string;
  busy: boolean;
  onEdit: () => void;
  onVerify: (codeOk: boolean) => void;
}) {
  const [digits, setDigits] = useState(["", "", "", ""]);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const pretty = identifier.replace(/^(\+91)(\d{5})(\d{5})$/, "$1 $2$3");

  function setAt(i: number, v: string) {
    const d = v.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    if (d && i < 3) refs.current[i + 1]?.focus();
  }
  function onKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  }
  const complete = digits.every((d) => d !== "");

  return (
    <>
      <BrandBadge brand={brand} />
      <Hero
        title="Your Streak "
        gold="Reward Awaits"
        sub="Sign in to reveal your streak — and unlock rewards made just for you."
      />
      <div className="ccd-card ccd-in d2">
        <div className="ccd-eyebrow">
          <span className="label">Verify OTP</span>
          <button className="edit" onClick={onEdit}>
            Edit
          </button>
        </div>
        <p className="ccd-otp-sub">
          Enter the code we sent to <b>{pretty}</b>
        </p>
        {error && <div className="ccd-error">{error}</div>}
        <div className="ccd-otp-row">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              className="ccd-otp-box"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => setAt(i, e.target.value)}
              onKeyDown={(e) => onKey(i, e)}
              autoFocus={i === 0}
            />
          ))}
        </div>
        <div className="ccd-otp-resend">
          <button className="ccd-link" onClick={() => setDigits(["", "", "", ""])}>
            Resend Code
          </button>
        </div>
        <button className="ccd-btn" disabled={busy} onClick={() => onVerify(complete)}>
          {busy ? "Verifying…" : "Verify & Win Streak"}
        </button>
        <p className="ccd-help">Enter the 4-digit code we sent to your mobile number.</p>
      </div>
      <HowItWorks />
    </>
  );
}

// ------------------------------------------------------------- Dashboard ----
function DashboardView({
  brand,
  campaign,
  streak,
  rewards,
  busy,
  error,
  onCheckIn,
  onLogout,
  onOpenReward,
}: {
  brand: BrandProfile | null;
  campaign: ActiveCampaign;
  streak: StreakState | null;
  rewards: RewardIssue[];
  busy: boolean;
  error: string;
  onCheckIn: () => void;
  onLogout: () => void;
  onOpenReward: (r: RewardIssue) => void;
}) {
  const current = streak?.current_count ?? 0;
  const milestones = useMemo(
    () => [...campaign.milestones].sort((a, b) => a.streak_count - b.streak_count),
    [campaign.milestones],
  );

  // Reward lookup by day so we can surface coupons/products on the streak track.
  const rewardByDay = useMemo(() => {
    const map = new Map<number, (typeof milestones)[number]>();
    milestones.forEach((m) => map.set(m.streak_count, m));
    return map;
  }, [milestones]);

  // Track spans the whole campaign goal (largest milestone), but never fewer
  // than 7 days. Long goals (30 / 365) scroll horizontally.
  const maxDay = milestones.length ? milestones[milestones.length - 1].streak_count : 7;
  const trackLength = Math.max(7, maxDay);

  // Subtitle points at the next uncompleted milestone.
  const nextDay = milestones.find((m) => m.streak_count > current)?.streak_count ?? maxDay;
  const away = Math.max(0, nextDay - current);

  // Did today's period already register? last_completed_at within today.
  const checkedInToday = useMemo(() => {
    if (!streak?.last_completed_at) return false;
    const last = new Date(streak.last_completed_at.replace(" ", "T") + "Z");
    return last.toDateString() === new Date().toDateString();
  }, [streak?.last_completed_at]);

  const pips = Array.from({ length: trackLength }, (_, i) => i + 1);

  // Keep the current/next day in view on a long, scrollable track.
  const pipsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = pipsRef.current?.querySelector<HTMLElement>(".ccd-pip.next, .ccd-pip.done:last-of-type");
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [current, trackLength]);

  return (
    <>
      <div className="ccd-brandrow ccd-in d1">
        <div className="b-top">
          <BrandLogo brand={brand} fallbackName={campaign.name} />
          <div className="b-name">
            {brand?.brand_name || campaign.name}
            <small>{campaign.name}</small>
          </div>
        </div>
        <p>
          {brand?.tagline ||
            "Visit every day. Don't break the streak. Unlock bigger rewards."}
        </p>
      </div>

      <div className="ccd-streak ccd-in d2">
        <div className="ccd-streak-count">
          <span className="flame">🔥</span>
          {current}
        </div>
        <h2>Your Daily Streak</h2>
        <div className={`ccd-pips ${trackLength > 7 ? "scroll" : ""}`} ref={pipsRef}>
          {pips.map((n) => {
            const cls = n <= current ? "done" : n === current + 1 ? "next" : "future";
            const reward = rewardByDay.get(n);
            return (
              <div className={`ccd-pip ${cls} ${reward ? "reward" : ""}`} key={n}>
                <span className="reward-badge" title={reward?.title}>
                  {reward ? rewardIcon(reward.type, reward.title) : ""}
                </span>
                <span className="num">{n}</span>
                <span className="dot">
                  {reward ? "🎁" : cls === "future" ? "" : "⚡"}
                </span>
              </div>
            );
          })}
        </div>
        <p className="sub">
          {away > 0 ? (
            <>
              Keep it up, you're <b>{away} {away === 1 ? "day" : "days"}</b> away from a{" "}
              <b>{nextDay} day streak!</b>
            </>
          ) : (
            <>You've reached the top streak — legendary. 🏆</>
          )}
        </p>
      </div>

      {error && <div className="ccd-error ccd-in d2">{error}</div>}

      <div className={`ccd-checkin ccd-in d3 ${checkedInToday ? "done" : ""}`}>
        <button className="ccd-btn" disabled={busy || checkedInToday} onClick={onCheckIn}>
          {busy ? "Checking in…" : checkedInToday ? "✓ Checked in today" : "Check in Today"}
        </button>
      </div>

      <MilestoneList milestones={campaign.milestones} current={current} />

      {rewards.length > 0 && (
        <div className="ccd-wallet ccd-in d4">
          <div className="ccd-wallet-head">Your Rewards</div>
          {rewards.map((r) => (
            <button
              key={r.id}
              className="ccd-reward-chip"
              onClick={() => onOpenReward(r)}
              style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
            >
              <span className="rc-ic">{rewardIcon(r.type, r.title)}</span>
              <span className="rc-body">
                <span className="rc-title">{r.title}</span>
                <br />
                <span className="rc-code">{formatCode(r.code)}</span>
              </span>
              <span className={`rc-status ${r.status}`}>{r.status}</span>
            </button>
          ))}
        </div>
      )}

      <button className="ccd-signout ccd-in d4" onClick={onLogout}>
        Not you? Sign out
      </button>
    </>
  );
}

// --------------------------------------------------------------- Branding ----
// Brand logo: the uploaded image if present, otherwise the gradient letter mark
// built from the brand (or campaign) name.
function BrandLogo({ brand, fallbackName }: { brand: BrandProfile | null; fallbackName?: string }) {
  if (brand?.logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="ccd-logo-img" src={brand.logo} alt={brand.brand_name || "logo"} />
    );
  }
  const label = brand?.brand_name || fallbackName || "Streaks";
  return (
    <div className="ccd-logo-mark" aria-hidden>
      {label
        .split(" ")
        .slice(0, 3)
        .map((w, i) => (
          <span key={i}>{w}</span>
        ))}
    </div>
  );
}

// Compact brand header shown above the hero on the signup / OTP screens.
function BrandBadge({ brand }: { brand: BrandProfile | null }) {
  if (!brand || (!brand.logo && !brand.brand_name)) return null;
  return (
    <div className="ccd-brandbadge ccd-in d1">
      <BrandLogo brand={brand} />
      <span className="bb-name">{brand.brand_name}</span>
    </div>
  );
}

// ---- theme colour helpers -------------------------------------------------
function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// Mix a hex colour toward white for the gradient's brighter stop.
function lighten(hex: string, amount = 0.35): string {
  const [r, g, b] = rgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${((1 << 24) | (mix(r) << 16) | (mix(g) << 8) | mix(b)).toString(16).slice(1)}`;
}
// Hex -> rgba() string for translucent accent surfaces.
function hexA(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Present raw hex codes like "A1B2YKFR" as "A1B2 - YKFR" (mockup styling).
function formatCode(code: string): string {
  if (code.includes("-")) return code;
  if (code.length >= 6) {
    const mid = Math.ceil(code.length / 2);
    return `${code.slice(0, mid)} - ${code.slice(mid)}`;
  }
  return code;
}
