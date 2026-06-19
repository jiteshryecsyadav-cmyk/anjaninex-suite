-- ============================================================================
-- Migration 49 — Bazaar Link (AD) supplier & buyer form gap-fill
-- Adds the small profile-level fields the forms need (website, owner/contact
-- person, GPS, buyer alt-phone / instagram / dual-role flag) PLUS the buyer
-- product catalog (demand + supply) tables mirroring the supplier catalog.
--
-- Convention: common identity (name/phone/gst/pan/address) stays in
-- core.contacts; these profile-specific extras live on the module tables
-- (suppliers.supplier_profiles / suppliers.buyer_profiles). Firm-scoped, RLS.
-- Idempotent. EF maps via UseSnakeCaseNamingConvention() so column names match
-- the C# property names in snake_case (Website -> website, etc).
-- ============================================================================

BEGIN;

-- ---------- 1. SUPPLIER profile extras ----------
ALTER TABLE suppliers.supplier_profiles ADD COLUMN IF NOT EXISTS website      TEXT;
ALTER TABLE suppliers.supplier_profiles ADD COLUMN IF NOT EXISTS owner_name   TEXT;   -- person/proprietor (separate from contact.legal_name)
ALTER TABLE suppliers.supplier_profiles ADD COLUMN IF NOT EXISTS gps_location TEXT;   -- "lat, long" string (same format as form)
-- rate_min / rate_max already added in migration 31; rate_unit already on table.

-- ---------- 2. BUYER profile extras ----------
ALTER TABLE suppliers.buyer_profiles ADD COLUMN IF NOT EXISTS owner_name   TEXT;       -- contact person
ALTER TABLE suppliers.buyer_profiles ADD COLUMN IF NOT EXISTS alt_phone    TEXT;       -- alternate mobile
ALTER TABLE suppliers.buyer_profiles ADD COLUMN IF NOT EXISTS website      TEXT;
ALTER TABLE suppliers.buyer_profiles ADD COLUMN IF NOT EXISTS instagram    TEXT;       -- instagram / social handle
ALTER TABLE suppliers.buyer_profiles ADD COLUMN IF NOT EXISTS is_supplier  BOOLEAN NOT NULL DEFAULT FALSE;  -- dual role
ALTER TABLE suppliers.buyer_profiles ADD COLUMN IF NOT EXISTS gps_location TEXT;

-- ---------- 3. BUYER PRODUCT CATALOG (demand + supply) ----------
-- Mirrors suppliers.varieties / variety_rates / variety_photos but keyed on a
-- buyer_id and tagged with catalog_type: 'demand' (jo khareedna hai) or
-- 'supply' (jo banake bechta hai — only meaningful when buyer is dual-role).
CREATE TABLE IF NOT EXISTS suppliers.buyer_varieties (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    buyer_id        UUID NOT NULL REFERENCES suppliers.buyer_profiles(id) ON DELETE CASCADE,
    catalog_type    TEXT NOT NULL DEFAULT 'demand',   -- demand | supply
    category_id     UUID REFERENCES suppliers.categories(id) ON DELETE SET NULL,
    category_name   TEXT,
    name            TEXT NOT NULL,
    d_no            TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_buyer_varieties_buyer ON suppliers.buyer_varieties(buyer_id, catalog_type);
CREATE INDEX IF NOT EXISTS idx_buyer_varieties_firm  ON suppliers.buyer_varieties(firm_id);

CREATE TABLE IF NOT EXISTS suppliers.buyer_variety_rates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variety_id      UUID NOT NULL REFERENCES suppliers.buyer_varieties(id) ON DELETE CASCADE,
    rate            NUMERIC(12,2),
    unit            TEXT DEFAULT 'mtr',
    min_qty         NUMERIC(12,2),
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_buyer_variety_rates_variety ON suppliers.buyer_variety_rates(variety_id);

CREATE TABLE IF NOT EXISTS suppliers.buyer_variety_photos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variety_id      UUID NOT NULL REFERENCES suppliers.buyer_varieties(id) ON DELETE CASCADE,
    url             TEXT NOT NULL,
    is_primary      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_buyer_variety_photos_variety ON suppliers.buyer_variety_photos(variety_id);

-- ---------- 4. RLS for the new catalog tables (same pattern as 46) ----------
ALTER TABLE suppliers.buyer_varieties ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers.buyer_varieties FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS firm_isolation_buyer_varieties ON suppliers.buyer_varieties;
CREATE POLICY firm_isolation_buyer_varieties ON suppliers.buyer_varieties
  USING       (firm_id = core.current_firm_id()
               OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK  (firm_id = core.current_firm_id()
               OR current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE suppliers.buyer_variety_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers.buyer_variety_rates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS firm_isolation_buyer_variety_rates ON suppliers.buyer_variety_rates;
CREATE POLICY firm_isolation_buyer_variety_rates ON suppliers.buyer_variety_rates
  USING       (EXISTS (SELECT 1 FROM suppliers.buyer_varieties v
                       WHERE v.id = buyer_variety_rates.variety_id AND v.firm_id = core.current_firm_id())
               OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK  (EXISTS (SELECT 1 FROM suppliers.buyer_varieties v
                       WHERE v.id = buyer_variety_rates.variety_id AND v.firm_id = core.current_firm_id())
               OR current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE suppliers.buyer_variety_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers.buyer_variety_photos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS firm_isolation_buyer_variety_photos ON suppliers.buyer_variety_photos;
CREATE POLICY firm_isolation_buyer_variety_photos ON suppliers.buyer_variety_photos
  USING       (EXISTS (SELECT 1 FROM suppliers.buyer_varieties v
                       WHERE v.id = buyer_variety_photos.variety_id AND v.firm_id = core.current_firm_id())
               OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK  (EXISTS (SELECT 1 FROM suppliers.buyer_varieties v
                       WHERE v.id = buyer_variety_photos.variety_id AND v.firm_id = core.current_firm_id())
               OR current_setting('app.is_platform_admin', true) = 'true');

COMMIT;

SELECT 'migration 49-ad-form-fields complete' AS status;
