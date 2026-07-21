# 🔥 Streaks — Habit & Engagement Streak Campaign Platform

A gamified engagement platform that rewards users for performing a target action
consistently over consecutive days, weeks, or months. All streak state is
**computed and stored server-side** — the client only reports the qualifying
action; the server validates it against campaign rules (cadence window,
missed-day behaviour, timezone) and advances or breaks the streak. Streaks and
reward unlocks cannot be forged from the client.

- **Backend** — PHP 8.3, dependency-free REST API (PDO + MySQL)
- **Frontend** — Next.js (App Router) admin panel
- **Database** — MySQL

```
Streaks/
├── backend/     PHP REST API + streak engine + cron job
└── frontend/    Next.js admin panel (SPA)
```

## Quick start

### 1. Backend

```bash
cd backend
cp .env.example .env              # adjust DB creds if needed
mysql -u root < migrations/schema.sql
php bin/seed.php                  # creates admin + demo campaigns/users/activity
php -S localhost:8080 -t public public/index.php
```

The API runs at **http://localhost:8080**. Seed admin: `admin@streaks.test` / `admin123`.

Upgrading an existing database rather than creating a fresh one? Apply the
numbered migrations you have not run yet, e.g.
`mysql -u root streaks < migrations/006_reward_image_upload.sql`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Admin panel at **http://localhost:3000** → sign in with the seed admin.

### 3. Scheduled period close (cron)

A scheduled job closes each elapsed period and applies each campaign's missed-day
behaviour (break vs. preserve):

```bash
# run manually
php backend/bin/close_periods.php

# or via cron, hourly
0 * * * *  php /path/to/Streaks/backend/bin/close_periods.php >> /var/log/streaks.log 2>&1
```

## Architecture

The **StreakEngine** (`backend/src/Services/StreakEngine.php`) is the integrity core:

- **Period index** — every timestamp maps to an integer period index in the
  campaign's timezone. Consecutive periods differ by exactly 1, so daily / weekly
  / monthly / custom cadences all share one model.
- **Idempotent per period** — a second action in the same period never
  double-counts (`already_completed`). `/api/action` also supports an
  `Idempotency-Key` header for replay protection.
- **Missed-day behaviour** — a gap of more than one period either resets the
  count to 0 (`break`) or preserves it (`no_break`, grace), per campaign config.
- **Idempotent milestone issuance** — a milestone reward is issued exactly once
  per milestone per streak-run.
- **Full audit trail** — every completion / miss / break / unlock / admin
  adjustment is recorded in `streak_events`.

## Admin panel

| Section          | Purpose |
|------------------|---------|
| Dashboard        | KPI counters, DAU & distribution charts, milestone redemption, live activity feed |
| Streak Rules     | Create/manage campaigns — cadence, missed-day behaviour, milestone → reward mapping |
| Rewards          | Define rewards (coupon / points / badge / custom), track issuance & redemption |
| Reward Calendar  | Schedule date-bound rewards on a month grid |
| Analytics        | DAU, streak-length cohorts, milestone funnel; filter by campaign & date range |
| Users            | Participant list + drill-down (streak timeline, rewards, manual adjust) |
| WhatsApp         | Delivery settings, live/simulation mode, test send, opt-out (STOP) management |
| Templates        | Editable message-template library with `[Bracket]` tokens + live preview |
| Promotions       | Broadcast a template to an audience segment; per-recipient token fill + tally |

## API surface

### Public / client

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/api/health` | Health check |
| GET  | `/api/campaigns/active` | Active campaigns + rules |
| POST | `/api/enroll` | Enroll user in a campaign |
| POST | `/api/action` | Report qualifying action; server advances streak |
| GET  | `/api/me/streaks` | Current user's streak state |
| GET  | `/api/me/rewards` | Current user's unlocked rewards |
| POST | `/api/rewards/:id/redeem` | Redeem an unlocked reward |

Client requests identify the participant via `X-User-Id` or `X-User-Identifier`
(email/mobile) header, or an `identifier` field in the body.

### Admin (`/api/admin/*`, Bearer token)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/login`, `/logout` | Session auth |
| GET/POST | `/campaigns` | List / create |
| GET/PUT/DELETE | `/campaigns/:id` | Read / update / delete |
| GET/PUT | `/campaigns/:id/milestones` | Read / replace milestone mapping |
| GET/POST | `/rewards` · PUT/DELETE `/rewards/:id` | Manage rewards |
| GET/POST | `/reward-calendar` · DELETE `/reward-calendar/:id` | Calendar schedule |
| GET | `/users` · `/users/:id` | Participants + drill-down |
| POST | `/users/:id/adjust-streak` | Manual streak adjustment |
| PATCH | `/reward-issues/:id` | Update reward status |
| GET | `/stats`, `/analytics`, `/activity` | Dashboard data |
| GET/PUT | `/whatsapp/settings` · GET `/whatsapp/status` | WhatsApp delivery config + live/simulation mode |
| GET/POST | `/whatsapp/templates` · PUT/DELETE `/whatsapp/templates/:id` | Template library |
| GET/POST | `/whatsapp/optouts` · DELETE `/whatsapp/optouts/:mobile` | Opt-out (STOP) management |
| GET | `/whatsapp/recipients?segment=` | Resolve an audience segment (minus opt-outs) |
| POST | `/whatsapp/broadcast`, `/whatsapp/test` | Send a promotion / a sample reward |

### Public (Meta-facing)

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/api/whatsapp/webhook` | Subscription verification (echoes `hub.challenge`) |
| POST | `/api/whatsapp/webhook` | Inbound messages; records STOP / UNSUBSCRIBE as opt-outs |

WhatsApp runs in **simulation mode** (messages logged, not sent) unless
`WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are set in the backend
env. See `backend/.env.example` for all `WHATSAPP_*` variables. Apply the schema
with `mysql -u root streaks < migrations/005_whatsapp.sql`.

## Data model

`campaigns`, `milestones`, `rewards`, `users`, `enrollments`, `streaks`,
`streak_events`, `reward_issues`, `reward_calendar` — see
`backend/migrations/schema.sql`.

## Security notes

- Server-side validation of every qualifying action; client streak state is never trusted.
- Every write endpoint validates its payload through `Streaks\Core\Validate`; the
  browser forms mirror those rules in `frontend/lib/validation.ts` for fast
  feedback, but the API never relies on them.
- Uploaded images (brand logo, reward image) are re-encoded through a canvas in
  the browser and stored as `data:` URIs, whitelisted to PNG/JPG/WebP/GIF. SVG
  is deliberately not accepted: it is the one format that would reach the
  database byte-for-byte, and these images render on the public check-in page.
- Bearer-token auth on all `/api/admin/*` routes.
- Idempotency on `/api/action` (per-period + `Idempotency-Key`) prevents replay/double-count.
- All transitions recorded in `streak_events` for auditability.
