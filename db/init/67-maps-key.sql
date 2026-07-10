-- 67: Central Anjaninex Google Maps key (single central key for all firms).
-- Stored in the same single-row platform.billing_settings (id = 1) as AI keys.
-- Browser Google Maps JS loads with this key (referrer-restricted key is safe to expose to firm frontend).

ALTER TABLE platform.billing_settings ADD COLUMN IF NOT EXISTS maps_key text;
