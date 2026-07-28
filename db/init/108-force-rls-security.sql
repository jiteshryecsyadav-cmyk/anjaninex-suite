-- ============================================================================
-- 108: SURAKSHA — 8 tables par RLS ka chhed band (FORCE) + OTP flood ki rok
-- ============================================================================
-- Postgres table ke MAALIK par RLS lagata hi nahi jab tak FORCE na ho. Humari
-- migrations namokara_app (= owner) se chalti hain, isliye in tables par policy
-- likhi hone ke BAWAJOOD ek firm doosri ka data padh sakti thi. Ab band.

ALTER TABLE trading.cheque_handovers        FORCE ROW LEVEL SECURITY;
ALTER TABLE trading.party_profiles          FORCE ROW LEVEL SECURITY;
ALTER TABLE trading.buyer_agents            FORCE ROW LEVEL SECURITY;
ALTER TABLE trading.buyer_agent_earnings    FORCE ROW LEVEL SECURITY;
ALTER TABLE trading.buyer_agent_payouts     FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.firm_field_settings    FORCE ROW LEVEL SECURITY;
ALTER TABLE hr.attendance_policies          FORCE ROW LEVEL SECURITY;
ALTER TABLE ai.extraction_logs              FORCE ROW LEVEL SECURITY;

-- Razorpay ka ek payment DO firms me bhuna na ja sake (RLS constraints par nahi lagti)
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_requests_method_ref
    ON platform.payment_requests (method, reference)
    WHERE reference IS NOT NULL AND reference <> '';

-- OTP flood ki rok — 15 min me kitne OTP bheje (per phone)
ALTER TABLE platform.party_chat_otps   ADD COLUMN IF NOT EXISTS sends INT NOT NULL DEFAULT 0;
ALTER TABLE platform.party_portal_otps ADD COLUMN IF NOT EXISTS sends INT NOT NULL DEFAULT 0;

-- Ek photo ka baar-baar broadcast na ho (storage/spam) — dedupe ke liye
CREATE INDEX IF NOT EXISTS idx_wa_incoming_firm_hash ON wa.incoming(firm_id, image_hash);

SELECT 'security hardening 108 ready ✓' AS status;
