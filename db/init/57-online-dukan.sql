-- ============================================================================
-- Namokara Suite — Online Dukan Module Tables  (schema: dukan)
--
-- Har Anjaninex FIRM ka apna "Online Dukan" hota hai — apni settings, categories,
-- products, buyers (external customers), orders aur reviews. Sab kuch firm_id se
-- scoped + RLS FORCE (cross-tenant leak DB level par impossible).
--
-- "Admin" of the dukan = logged-in Anjaninex firm user (existing JWT/firm_id).
-- "Buyers" = external customers (phone + 6-digit PIN) — alag buyer JWT milta hai
--   jisme firm_id claim hota hai (taaki RLS context middleware app.current_firm_id
--   set kare) + role 'dukan_buyer' + buyer_id.
--
-- Ported from the KALINDI Express+JSON backend (db.json → Postgres, multi-tenant).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS dukan;

-- =================================================
-- 1. SETTINGS  (seller profile — 1 row per firm)
-- =================================================
CREATE TABLE IF NOT EXISTS dukan.settings (
    firm_id     UUID PRIMARY KEY REFERENCES platform.firms(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT '',
    upi         TEXT,
    acc         TEXT,
    ifsc        TEXT,
    bank        TEXT,
    city        TEXT,
    gst         TEXT,
    mobile      TEXT,
    email       TEXT,
    address     TEXT,
    whatsapp    TEXT,
    instagram   TEXT,
    facebook    TEXT,
    rating      NUMERIC(3,2) DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- =================================================
-- 2. CATEGORIES
-- =================================================
CREATE TABLE IF NOT EXISTS dukan.categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'active',   -- active|inactive
    descr       TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dukan_categories_firm ON dukan.categories(firm_id);

-- =================================================
-- 3. PRODUCTS
-- =================================================
CREATE TABLE IF NOT EXISTS dukan.products (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    cat_id      UUID REFERENCES dukan.categories(id) ON DELETE SET NULL,
    name        TEXT NOT NULL DEFAULT '',
    code        TEXT,
    mrp         NUMERIC(12,2) DEFAULT 0,
    rate        NUMERIC(12,2) DEFAULT 0,
    stock       INT DEFAULT 0,
    img         TEXT,
    gst         NUMERIC(5,2) DEFAULT 0,
    gst_inc     BOOLEAN DEFAULT TRUE,
    combo       BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dukan_products_firm ON dukan.products(firm_id);
CREATE INDEX IF NOT EXISTS idx_dukan_products_cat ON dukan.products(cat_id);

-- =================================================
-- 4. BUYERS  (external customers — phone + 6-digit PIN)
-- =================================================
CREATE TABLE IF NOT EXISTS dukan.buyers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT '',
    phone       TEXT NOT NULL,
    pin_hash    TEXT NOT NULL,
    email       TEXT,
    gstin       TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (firm_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_dukan_buyers_firm ON dukan.buyers(firm_id);

-- =================================================
-- 5. BUYER ADDRESSES
-- =================================================
CREATE TABLE IF NOT EXISTS dukan.buyer_addresses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    buyer_id    UUID NOT NULL REFERENCES dukan.buyers(id) ON DELETE CASCADE,
    label       TEXT,
    receiver    TEXT,
    mobile      TEXT,
    line        TEXT,
    city        TEXT,
    state       TEXT,
    pin         TEXT,
    is_default  BOOLEAN DEFAULT FALSE,
    lat         NUMERIC(10,6),
    lng         NUMERIC(10,6),
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dukan_addresses_buyer ON dukan.buyer_addresses(buyer_id);
CREATE INDEX IF NOT EXISTS idx_dukan_addresses_firm ON dukan.buyer_addresses(firm_id);

-- =================================================
-- 6. ORDERS
-- =================================================
CREATE TABLE IF NOT EXISTS dukan.orders (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    bill_no     TEXT,
    buyer_id    UUID REFERENCES dukan.buyers(id) ON DELETE SET NULL,
    buyer_name  TEXT,
    order_date  TIMESTAMPTZ DEFAULT now(),
    subtotal    NUMERIC(14,2) DEFAULT 0,
    delivery    NUMERIC(14,2) DEFAULT 0,
    gst         NUMERIC(14,2) DEFAULT 0,
    total       NUMERIC(14,2) DEFAULT 0,
    receiver    TEXT,
    address     TEXT,
    status      TEXT NOT NULL DEFAULT 'PAID',
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dukan_orders_firm ON dukan.orders(firm_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_dukan_orders_buyer ON dukan.orders(buyer_id);

CREATE TABLE IF NOT EXISTS dukan.order_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    order_id    UUID NOT NULL REFERENCES dukan.orders(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT '',
    qty         INT NOT NULL DEFAULT 1,
    rate        NUMERIC(12,2) DEFAULT 0,
    gst         NUMERIC(5,2) DEFAULT 0,
    gst_inc     BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_dukan_order_items_order ON dukan.order_items(order_id);

-- =================================================
-- 7. REVIEWS  (1 per order — PK (firm_id, order_id))
-- =================================================
CREATE TABLE IF NOT EXISTS dukan.reviews (
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    order_id    UUID NOT NULL REFERENCES dukan.orders(id) ON DELETE CASCADE,
    stars       INT NOT NULL DEFAULT 0,
    text        TEXT,
    buyer       TEXT,
    review_date TIMESTAMPTZ DEFAULT now(),
    reply       TEXT,
    reply_date  TIMESTAMPTZ,
    PRIMARY KEY (firm_id, order_id)
);

-- ============================================================================
-- RLS — ENABLE + FORCE + firm isolation policies (platform-admin bypass)
-- Mirrors 05-rls.sql / 51-rls-platform-admin-bypass.sql exactly.
-- ============================================================================
ALTER TABLE dukan.settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE dukan.settings        FORCE  ROW LEVEL SECURITY;
ALTER TABLE dukan.categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE dukan.categories      FORCE  ROW LEVEL SECURITY;
ALTER TABLE dukan.products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE dukan.products        FORCE  ROW LEVEL SECURITY;
ALTER TABLE dukan.buyers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE dukan.buyers          FORCE  ROW LEVEL SECURITY;
ALTER TABLE dukan.buyer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE dukan.buyer_addresses FORCE  ROW LEVEL SECURITY;
ALTER TABLE dukan.orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE dukan.orders          FORCE  ROW LEVEL SECURITY;
ALTER TABLE dukan.order_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dukan.order_items     FORCE  ROW LEVEL SECURITY;
ALTER TABLE dukan.reviews         ENABLE ROW LEVEL SECURITY;
ALTER TABLE dukan.reviews         FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS firm_isolation_dukan_settings ON dukan.settings;
CREATE POLICY firm_isolation_dukan_settings ON dukan.settings
  USING      (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

DROP POLICY IF EXISTS firm_isolation_dukan_categories ON dukan.categories;
CREATE POLICY firm_isolation_dukan_categories ON dukan.categories
  USING      (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

DROP POLICY IF EXISTS firm_isolation_dukan_products ON dukan.products;
CREATE POLICY firm_isolation_dukan_products ON dukan.products
  USING      (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

DROP POLICY IF EXISTS firm_isolation_dukan_buyers ON dukan.buyers;
CREATE POLICY firm_isolation_dukan_buyers ON dukan.buyers
  USING      (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

DROP POLICY IF EXISTS firm_isolation_dukan_addresses ON dukan.buyer_addresses;
CREATE POLICY firm_isolation_dukan_addresses ON dukan.buyer_addresses
  USING      (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

DROP POLICY IF EXISTS firm_isolation_dukan_orders ON dukan.orders;
CREATE POLICY firm_isolation_dukan_orders ON dukan.orders
  USING      (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

DROP POLICY IF EXISTS firm_isolation_dukan_order_items ON dukan.order_items;
CREATE POLICY firm_isolation_dukan_order_items ON dukan.order_items
  USING      (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

DROP POLICY IF EXISTS firm_isolation_dukan_reviews ON dukan.reviews;
CREATE POLICY firm_isolation_dukan_reviews ON dukan.reviews
  USING      (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

-- ----------------------------------------------------------------------------
-- Grants for the app role (mirrors 05-rls.sql). dukan schema is NEW, so the
-- blanket GRANTs in 05 (which ran earlier) did not cover it.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'namokara_app') THEN
        GRANT USAGE ON SCHEMA dukan TO namokara_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA dukan TO namokara_app;
        GRANT USAGE ON ALL SEQUENCES IN SCHEMA dukan TO namokara_app;
        ALTER DEFAULT PRIVILEGES IN SCHEMA dukan GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO namokara_app;
        ALTER DEFAULT PRIVILEGES IN SCHEMA dukan GRANT USAGE ON SEQUENCES TO namokara_app;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'namokara_super') THEN
        GRANT USAGE ON SCHEMA dukan TO namokara_super;
        GRANT ALL ON ALL TABLES IN SCHEMA dukan TO namokara_super;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA dukan TO namokara_super;
    END IF;
END $$;

SELECT 'Online Dukan tables created ✓ (dukan.* + RLS FORCE + platform-admin bypass)' AS status;
