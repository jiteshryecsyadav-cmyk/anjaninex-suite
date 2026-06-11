-- ============================================================================
-- Migration 25 — WhatsApp Bot Orders
-- Buyer photo pasand karke order kare -> supplier accept kare -> yahan save.
-- AD / Order list page isi table se dikhega.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS wa.orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID,
    order_code      TEXT,                         -- ORD-000123
    incoming_id     UUID REFERENCES wa.incoming(id) ON DELETE SET NULL,  -- kaunsi photo
    track_code      TEXT,                         -- NAM-S...-R...
    buyer_phone     TEXT,                         -- 10-digit
    buyer_id        UUID,                         -- suppliers.buyer_profiles.id
    buyer_name      TEXT,
    supplier_phone  TEXT,
    supplier_id     UUID,                         -- suppliers.supplier_profiles.id
    supplier_name   TEXT,
    category_name   TEXT,
    rate            NUMERIC(12,2),
    rate_unit       TEXT,
    quantity        NUMERIC(14,2),
    amount          NUMERIC(16,2),                -- rate * quantity
    image_path      TEXT,
    status          TEXT DEFAULT 'pending_supplier',  -- pending_supplier|accepted|rejected|converted
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_orders_firm     ON wa.orders(firm_id);
CREATE INDEX IF NOT EXISTS idx_wa_orders_status   ON wa.orders(status);
CREATE INDEX IF NOT EXISTS idx_wa_orders_buyer    ON wa.orders(buyer_phone);
CREATE INDEX IF NOT EXISTS idx_wa_orders_supplier ON wa.orders(supplier_phone);
CREATE INDEX IF NOT EXISTS idx_wa_orders_created  ON wa.orders(created_at);

COMMIT;

SELECT 'migration 25-wa-orders complete' AS status;
