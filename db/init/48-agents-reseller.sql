-- ============================================================================
-- 48 — Agent / Reseller program (platform-level, NOT firm-RLS-scoped)
--
-- Goal: Agents (resellers) app bechte hain aur firms refer karte hain. Har agent
-- ka ek unique CODE hota hai. Firm create karte waqt agent code dal sakte ho →
-- firm.agent_id link ho jata hai. Jab wo firm wallet recharge karti hai to
-- referring agent ko commission milta hai:
--   - FIRST EVER recharge  →  (signup% + recharge%)
--   - har agle recharge    →  (recharge% only)
-- Single level (koi sub-agent nahi). Agents login karke apna dashboard dekh sakte hain.
--
-- platform.firms RLS-filtered NAHI hai (plain platform table) — isliye agents /
-- agent_commissions / agent_payouts bhi plain platform tables hain (no RLS).
-- Idempotent: dobara chalane safe hai (IF NOT EXISTS).
-- ============================================================================

-- Agents (resellers)
CREATE TABLE IF NOT EXISTS platform.agents (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                     TEXT UNIQUE NOT NULL,
    name                     TEXT NOT NULL,
    email                    TEXT,
    phone                    TEXT,
    signup_commission_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
    recharge_commission_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
    wallet_balance           NUMERIC(14,2) NOT NULL DEFAULT 0,
    status                   TEXT NOT NULL DEFAULT 'active',   -- active | suspended
    notes                    TEXT,
    created_at               TIMESTAMPTZ DEFAULT now(),
    updated_at               TIMESTAMPTZ DEFAULT now()
);

-- Commission ledger — har earning ki ek row (signup ya recharge)
CREATE TABLE IF NOT EXISTS platform.agent_commissions (
    id              BIGSERIAL PRIMARY KEY,
    agent_id        UUID NOT NULL REFERENCES platform.agents(id),
    firm_id         UUID NOT NULL REFERENCES platform.firms(id),
    kind            TEXT NOT NULL,                       -- signup | recharge
    recharge_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    commission_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
    commission_amt  NUMERIC(14,2) NOT NULL DEFAULT 0,
    reference_id    TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',     -- pending | paid
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Payouts — agent ko paise diye gaye (commission settle)
CREATE TABLE IF NOT EXISTS platform.agent_payouts (
    id          BIGSERIAL PRIMARY KEY,
    agent_id    UUID NOT NULL REFERENCES platform.agents(id),
    amount      NUMERIC(14,2) NOT NULL,
    method      TEXT,
    reference   TEXT,
    notes       TEXT,
    created_by  UUID,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Firm -> agent link (jisne refer kiya)
ALTER TABLE platform.firms ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES platform.agents(id);

-- Agent login user link (core.users row = agent ka login)
ALTER TABLE core.users ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES platform.agents(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent_time ON platform.agent_commissions(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_firm        ON platform.agent_commissions(firm_id);
CREATE INDEX IF NOT EXISTS idx_firms_agent                   ON platform.firms(agent_id);
CREATE INDEX IF NOT EXISTS idx_users_agent                   ON core.users(agent_id);

SELECT 'Agents / reseller tables created ✓' AS status;
