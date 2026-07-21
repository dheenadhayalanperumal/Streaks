-- Reward images moved from "paste a URL" to an in-browser upload, so the column
-- now has to hold a base64 `data:` URI instead of a 500-char link.
-- The admin UI downscales every upload before sending it, so real values land
-- well under 100 KB; LONGTEXT matches what brand_profile.logo already uses.
USE streaks;

ALTER TABLE rewards
  MODIFY COLUMN image LONGTEXT NULL COMMENT 'uploaded image as a data: URI, or an http(s) URL';
