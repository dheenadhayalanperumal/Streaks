-- Migration 002: campaign geofencing + milestone ↔ calendar reward association.
-- Safe to run once on an existing DB. schema.sql already carries these columns
-- for fresh installs.
USE streaks;

-- Location check-in: a campaign may require the participant to be within
-- geofence_radius_m metres of (latitude, longitude) to record an action.
ALTER TABLE campaigns
  ADD COLUMN latitude          DECIMAL(10,7) NULL AFTER end_date,
  ADD COLUMN longitude         DECIMAL(10,7) NULL AFTER latitude,
  ADD COLUMN geofence_radius_m INT UNSIGNED  NULL AFTER longitude;

-- A milestone may be fulfilled by a date-bound reward-calendar entry instead of
-- a plain reward. reward_id still holds the reward that gets issued.
ALTER TABLE milestones
  ADD COLUMN calendar_id BIGINT UNSIGNED NULL AFTER reward_id,
  ADD CONSTRAINT fk_ms_calendar FOREIGN KEY (calendar_id)
    REFERENCES reward_calendar(id) ON DELETE SET NULL;
