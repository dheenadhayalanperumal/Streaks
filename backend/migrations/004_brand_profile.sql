-- Streaks — Brand profile (single-row settings the admin edits and the
-- customer check-in page reflects dynamically).
-- Run:  mysql -u root streaks < migrations/004_brand_profile.sql
USE streaks;

CREATE TABLE IF NOT EXISTS brand_profile (
  id          TINYINT UNSIGNED NOT NULL PRIMARY KEY,   -- always 1 (single row)
  brand_name  VARCHAR(120)  NOT NULL DEFAULT 'Streaks',
  tagline     VARCHAR(255)  NULL,
  logo        LONGTEXT      NULL,        -- URL or base64 data: URI
  theme_color CHAR(7)       NOT NULL DEFAULT '#ef5a7f', -- hex accent, e.g. #ef5a7f
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Seed the single row if the table is empty.
INSERT INTO brand_profile (id, brand_name, tagline, theme_color)
SELECT 1, 'Streaks', 'Show up daily. Don''t break the chain — claim the reward.', '#ef5a7f'
WHERE NOT EXISTS (SELECT 1 FROM brand_profile WHERE id = 1);
