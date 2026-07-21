-- Streaks — Habit & Engagement Streak Campaign Platform
-- MySQL schema (idempotent). Run:  mysql -u root streaks < migrations/schema.sql

CREATE DATABASE IF NOT EXISTS streaks
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE streaks;

-- ---------------------------------------------------------------------------
-- Admin auth
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120)  NOT NULL,
  email         VARCHAR(190)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  role          ENUM('admin','operator','analyst') NOT NULL DEFAULT 'operator',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_sessions (
  token         CHAR(64)      NOT NULL PRIMARY KEY,
  admin_user_id BIGINT UNSIGNED NOT NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at    TIMESTAMP     NULL DEFAULT NULL,   -- always set explicitly on login
  CONSTRAINT fk_session_admin FOREIGN KEY (admin_user_id)
    REFERENCES admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Rewards
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rewards (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(190)  NOT NULL,
  description   TEXT          NULL,
  type          ENUM('coupon','points','badge','custom') NOT NULL DEFAULT 'coupon',
  value         VARCHAR(120)  NULL,          -- e.g. "10%", "500", badge slug
  image         LONGTEXT      NULL,          -- uploaded image as a data: URI, or an http(s) URL
  validity_days INT UNSIGNED  NULL,          -- reward expires this many days after issue
  active        TINYINT(1)    NOT NULL DEFAULT 1,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Campaigns (all streak logic lives here)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name                 VARCHAR(190) NOT NULL,
  description          TEXT         NULL,
  type                 ENUM('daily','weekly','monthly','custom') NOT NULL DEFAULT 'daily',
  custom_period_days   INT UNSIGNED NULL,     -- required when type = custom
  missed_day_behaviour ENUM('break','no_break') NOT NULL DEFAULT 'break',
  qualifying_action    VARCHAR(120) NOT NULL DEFAULT 'check_in',
  timezone             VARCHAR(64)  NOT NULL DEFAULT 'UTC',
  start_date           DATE         NULL,
  end_date             DATE         NULL,
  latitude             DECIMAL(10,7) NULL,    -- geofenced check-in (optional)
  longitude            DECIMAL(10,7) NULL,
  geofence_radius_m    INT UNSIGNED  NULL,    -- action only counts within this radius
  active               TINYINT(1)   NOT NULL DEFAULT 1,
  created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Milestones: streak_count -> reward mapping (per campaign)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS milestones (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  campaign_id  BIGINT UNSIGNED NOT NULL,
  streak_count INT UNSIGNED    NOT NULL,
  reward_id    BIGINT UNSIGNED NOT NULL,
  calendar_id  BIGINT UNSIGNED NULL,          -- optional link to a reward_calendar entry
  created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_campaign_count (campaign_id, streak_count),
  CONSTRAINT fk_ms_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_ms_reward   FOREIGN KEY (reward_id)   REFERENCES rewards(id)   ON DELETE CASCADE
) ENGINE=InnoDB;
-- fk_ms_calendar added after reward_calendar is defined (see end of file)

-- ---------------------------------------------------------------------------
-- Participants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(190) NULL,
  identifier VARCHAR(190) NOT NULL UNIQUE,  -- mobile or email
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Enrollments (user <-> campaign)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enrollments (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  campaign_id BIGINT UNSIGNED NOT NULL,
  joined_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status      ENUM('active','left') NOT NULL DEFAULT 'active',
  UNIQUE KEY uq_user_campaign (user_id, campaign_id),
  CONSTRAINT fk_en_user     FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE,
  CONSTRAINT fk_en_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Current streak state per enrollment
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS streaks (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  enrollment_id      BIGINT UNSIGNED NOT NULL UNIQUE,
  current_count      INT UNSIGNED    NOT NULL DEFAULT 0,
  longest_count      INT UNSIGNED    NOT NULL DEFAULT 0,
  missed_count       INT UNSIGNED    NOT NULL DEFAULT 0,
  last_period_index  BIGINT          NULL,       -- integer index of last completed period
  last_completed_at  TIMESTAMP       NULL,
  status             ENUM('active','broken') NOT NULL DEFAULT 'active',
  updated_at         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_streak_en FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Every period completion / miss / break  (audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS streak_events (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  enrollment_id BIGINT UNSIGNED NOT NULL,
  event_type    ENUM('completed','missed','broken','advanced','reward_unlocked','admin_adjust') NOT NULL,
  period_key    VARCHAR(64)  NULL,       -- readable period label
  period_index  BIGINT       NULL,
  streak_count  INT UNSIGNED NULL,
  meta          JSON         NULL,
  occurred_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_en_period (enrollment_id, period_index),
  KEY idx_occurred (occurred_at),
  CONSTRAINT fk_ev_en FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Issued reward instances
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reward_issues (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL,
  reward_id    BIGINT UNSIGNED NOT NULL,
  milestone_id BIGINT UNSIGNED NULL,
  enrollment_id BIGINT UNSIGNED NULL,
  streak_run   INT UNSIGNED NULL,       -- which streak-run this unlock belongs to (idempotency)
  code         VARCHAR(64)  NOT NULL,
  status       ENUM('unlocked','redeemed','expired') NOT NULL DEFAULT 'unlocked',
  issued_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  redeemed_at  TIMESTAMP    NULL,
  expires_at   TIMESTAMP    NULL,
  UNIQUE KEY uq_once (user_id, milestone_id, streak_run),
  KEY idx_user (user_id),
  CONSTRAINT fk_ri_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
  CONSTRAINT fk_ri_reward FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Date-bound reward schedule
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reward_calendar (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  campaign_id BIGINT UNSIGNED NULL,
  reward_id   BIGINT UNSIGNED NOT NULL,
  date        DATE            NOT NULL,
  note        VARCHAR(255)    NULL,
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_date (date),
  CONSTRAINT fk_cal_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_cal_reward   FOREIGN KEY (reward_id)   REFERENCES rewards(id)   ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Idempotency keys for /api/action (replay protection)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  idem_key    VARCHAR(120) NOT NULL UNIQUE,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
