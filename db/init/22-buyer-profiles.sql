-- ============================================================================
-- Migration 22 — Buyer Profiles (Active Directory)
-- Purpose: Buyer ko AD me detailed rakhna — supplier_profiles jaisa, par buyer
--          ke business fields (budget, order frequency, payment terms) ke saath.
--          Common data (naam/phone/GST/address) core.contacts (Core Master) me
--          rehta hai; ye table sirf buyer-specific detail rakhta hai.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS suppliers.buyer_profiles (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id           UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    contact_id        UUID NOT NULL REFERENCES core.contacts(id) ON DELETE CASCADE,
    buyer_code        TEXT,
    buyer_type        TEXT,                       -- boutique|retailer|wholesaler|designer|online_store|bulk_buyer|reseller|tailor|other
    brand_name        TEXT,
    categories        JSONB DEFAULT '[]',          -- interested category UUIDs (shared with suppliers.categories)
    budget_min        NUMERIC(14,2),
    budget_max        NUMERIC(14,2),
    budget_unit       TEXT DEFAULT 'mtr',          -- mtr|pcs|kg
    order_frequency   TEXT,                        -- daily|weekly|monthly|quarterly|yearly|occasional
    payment_terms     TEXT,
    quality_pref      TEXT,                        -- premium|standard|economy|mixed
    target_customer   TEXT,                        -- b2b|b2c|both
    wa_phone          TEXT,
    notes             TEXT,
    is_active         BOOLEAN DEFAULT TRUE,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now(),
    UNIQUE (firm_id, contact_id),
    UNIQUE (firm_id, buyer_code)
);

CREATE INDEX IF NOT EXISTS idx_buyer_profiles_firm ON suppliers.buyer_profiles(firm_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_buyer_profiles_contact ON suppliers.buyer_profiles(firm_id, contact_id);

-- RLS (same firm isolation as the rest of the app)
ALTER TABLE suppliers.buyer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers.buyer_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS buyer_profiles_firm ON suppliers.buyer_profiles;
CREATE POLICY buyer_profiles_firm ON suppliers.buyer_profiles
    USING (firm_id = core.current_firm_id())
    WITH CHECK (firm_id = core.current_firm_id());

COMMIT;

SELECT 'migration 22-buyer-profiles complete' AS status;
