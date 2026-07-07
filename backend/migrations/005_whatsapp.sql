-- Streaks — WhatsApp integration, approved templates & promotion broadcasts.
-- Run:  mysql -u root streaks < migrations/005_whatsapp.sql
USE streaks;

-- ---------------------------------------------------------------------------
-- Per-client WhatsApp delivery settings (single editable row, id = 1).
-- Credentials themselves live in env vars — only per-client toggles live here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wa_settings (
  id                TINYINT UNSIGNED NOT NULL PRIMARY KEY,   -- always 1
  wa_enabled        TINYINT(1)   NOT NULL DEFAULT 0,          -- master on/off for delivery
  wa_phone_number_id VARCHAR(64) NULL,                        -- overrides env phone number id
  wa_template_name  VARCHAR(120) NOT NULL DEFAULT 'streak_reward',  -- library template used as the reward
  wa_template_body  TEXT         NULL,                        -- fallback body if no library template matches
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO wa_settings (id, wa_enabled, wa_template_name)
SELECT 1, 0, 'streak_reward'
WHERE NOT EXISTS (SELECT 1 FROM wa_settings WHERE id = 1);

-- ---------------------------------------------------------------------------
-- Editable message-template library (uses [Bracket] tokens).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wa_templates (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(80)  NOT NULL,          -- normalized: lowercased, spaces -> _
  body       TEXT         NOT NULL,          -- contains [Name], [CODE], etc.
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_name (name)
) ENGINE=InnoDB;

-- Seed default templates (skipped if the table already has rows).
INSERT INTO wa_templates (name, body)
SELECT * FROM (
  SELECT 'streak_reward' AS name,
         'Hey [Name]! 🔥 You kept your streak going at [Business Name] and unlocked: [Prize]. Use code [CODE] on your next visit. Valid for [Days] days. Reply STOP to unsubscribe.' AS body
  UNION ALL SELECT 'streak_reminder',
         'Hi [Name]! ⏰ Don''t break your streak at [Business Name] — check in today to keep the chain alive and earn your next reward. Reply STOP to unsubscribe.'
  UNION ALL SELECT 'win_back',
         'We miss you, [Name]! 💛 Come back to [Business Name] and start a fresh streak for a new reward. Reply STOP to unsubscribe.'
) seed
WHERE NOT EXISTS (SELECT 1 FROM wa_templates);

-- ---------------------------------------------------------------------------
-- Opt-outs (STOP handling) — a normalized phone that replied STOP.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wa_opt_outs (
  mobile     VARCHAR(20) NOT NULL PRIMARY KEY,   -- normalized (digits, last 10)
  created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
