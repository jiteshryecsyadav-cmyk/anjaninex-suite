-- ============================================================================
-- Namokara Suite — Suppliers Module Tables
-- Supplier directory with photos, categories, rates, WhatsApp integration
-- ============================================================================

-- =================================================
-- 1. SUPPLIER CATEGORIES (fabric / textile types)
-- =================================================
CREATE TABLE suppliers.categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    slug            TEXT,
    icon            TEXT,
    color           TEXT,
    is_system       BOOLEAN DEFAULT FALSE,
    sort_order      INT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (firm_id, name)
);
CREATE INDEX idx_categories_firm ON suppliers.categories(firm_id);

-- =================================================
-- 2. SUPPLIER PROFILES (extends core.contacts)
-- =================================================
CREATE TABLE suppliers.supplier_profiles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    contact_id      UUID NOT NULL REFERENCES core.contacts(id) ON DELETE CASCADE,
    supplier_code   TEXT,
    business_type   TEXT,                       -- manufacturer|trader|broker|wholesaler
    categories      JSONB DEFAULT '[]',          -- array of category UUIDs
    rate_unit       TEXT DEFAULT 'mtr',          -- mtr | pcs | kg | doz
    wa_group_id     TEXT,                        -- WhatsApp group link
    wa_phone        TEXT,                        -- primary WA number
    last_rate_update TIMESTAMPTZ,
    reliability_score NUMERIC(3,2),              -- 0.00 - 5.00
    min_order_value NUMERIC(14,2),
    delivery_lead_days INT,
    notes           TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (firm_id, contact_id),
    UNIQUE (firm_id, supplier_code)
);
CREATE INDEX idx_supplier_profiles_firm ON suppliers.supplier_profiles(firm_id) WHERE is_active = TRUE;

-- =================================================
-- 3. SUPPLIER PHOTOS (4 slots per supplier with rate)
-- =================================================
CREATE TABLE suppliers.photos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL,
    supplier_id     UUID NOT NULL REFERENCES suppliers.supplier_profiles(id) ON DELETE CASCADE,
    storage_url     TEXT NOT NULL,
    thumbnail_url   TEXT,
    title           TEXT,                          -- e.g., "Design 3030"
    rate            NUMERIC(10,2),
    rate_unit       TEXT,
    sort_order      INT DEFAULT 0,
    uploaded_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_photos_supplier ON suppliers.photos(supplier_id, sort_order);

-- =================================================
-- 4. SUPPLIER RATES (per category)
-- =================================================
CREATE TABLE suppliers.rates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL,
    supplier_id     UUID NOT NULL REFERENCES suppliers.supplier_profiles(id) ON DELETE CASCADE,
    category_id     UUID REFERENCES suppliers.categories(id),
    category_name   TEXT,
    rate            NUMERIC(10,2) NOT NULL,
    rate_unit       TEXT NOT NULL,
    min_qty         NUMERIC(10,2),
    valid_from      DATE,
    valid_to        DATE,
    source          TEXT DEFAULT 'manual',         -- manual|ai_rate_sheet|wa
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_rates_supplier ON suppliers.rates(supplier_id);

-- =================================================
-- RLS
-- =================================================
ALTER TABLE suppliers.categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers.supplier_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers.photos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers.rates              ENABLE ROW LEVEL SECURITY;

CREATE POLICY firm_isolation_sup_cat   ON suppliers.categories        USING (firm_id = current_firm_id());
CREATE POLICY firm_isolation_sup_prof  ON suppliers.supplier_profiles USING (firm_id = current_firm_id());
CREATE POLICY firm_isolation_photos    ON suppliers.photos            USING (firm_id = current_firm_id());
CREATE POLICY firm_isolation_rates     ON suppliers.rates             USING (firm_id = current_firm_id());

SELECT 'Suppliers tables created ✓' AS status;
