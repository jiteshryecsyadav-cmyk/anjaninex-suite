-- 68: Multi-provider maps for Live Location Map. Admin dropdown se choose:
--   'osm'    = OpenStreetMap + MapLibre (FREE, no key)
--   'google' = Google Maps JS (key = maps_key, existing column)
--   'ola'    = Ola Maps / MapLibre (key = maps_ola_key)
-- Default OSM so map always works without any key/billing.

ALTER TABLE platform.billing_settings ADD COLUMN IF NOT EXISTS maps_provider text DEFAULT 'osm';
ALTER TABLE platform.billing_settings ADD COLUMN IF NOT EXISTS maps_ola_key text;

-- Existing rows: default to OSM if null.
UPDATE platform.billing_settings SET maps_provider = 'osm' WHERE maps_provider IS NULL;
