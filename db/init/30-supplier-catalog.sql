-- ============================================================================
-- Migration 30 — Supplier Product Catalog (Varieties + Rates + Photos)
-- Category ke andar variety (jaise "cotton 60-60 plain"), har variety me
-- multiple rates + photos. Sample wale Product Catalog jaisa.
-- ============================================================================

BEGIN;

-- Variety: kisi supplier ki, kisi category ke andar (custom category bhi).
CREATE TABLE IF NOT EXISTS suppliers.varieties (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    supplier_id     UUID NOT NULL REFERENCES suppliers.supplier_profiles(id) ON DELETE CASCADE,
    category_id     UUID REFERENCES suppliers.categories(id) ON DELETE SET NULL,
    category_name   TEXT,                       -- snapshot (custom category ke liye)
    name            TEXT NOT NULL,              -- "cotton 60-60 plain"
    d_no            TEXT,                       -- design number
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_varieties_supplier ON suppliers.varieties(supplier_id);
CREATE INDEX IF NOT EXISTS idx_varieties_firm     ON suppliers.varieties(firm_id);

-- Har variety me ek ya zyada rate (unit ke saath).
CREATE TABLE IF NOT EXISTS suppliers.variety_rates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variety_id      UUID NOT NULL REFERENCES suppliers.varieties(id) ON DELETE CASCADE,
    rate            NUMERIC(12,2),
    unit            TEXT DEFAULT 'mtr',          -- mtr|pcs|kg|doz
    min_qty         NUMERIC(12,2),
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_variety_rates_variety ON suppliers.variety_rates(variety_id);

-- Har variety ki photos (local upload URL).
CREATE TABLE IF NOT EXISTS suppliers.variety_photos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variety_id      UUID NOT NULL REFERENCES suppliers.varieties(id) ON DELETE CASCADE,
    url             TEXT NOT NULL,
    is_primary      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_variety_photos_variety ON suppliers.variety_photos(variety_id);

COMMIT;

SELECT 'migration 30-supplier-catalog complete' AS status;
