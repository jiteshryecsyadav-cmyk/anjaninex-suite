-- 65: Buyer Agent (del-credere / payment-guarantee agent) - buyer ka agent jo payment ki
-- guarantee leta hai aur badle me hamari commission ka X% leta hai.

-- Master
CREATE TABLE IF NOT EXISTS trading.buyer_agents (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id           uuid NOT NULL,
    name              text NOT NULL,
    phone             text,
    city              text,
    default_share_pct numeric(5,2) DEFAULT 0,
    notes             text,
    is_active         boolean DEFAULT true,
    created_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_buyer_agents_firm ON trading.buyer_agents(firm_id, name);
ALTER TABLE trading.buyer_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS firm_isolation_buyer_agents ON trading.buyer_agents;
CREATE POLICY firm_isolation_buyer_agents ON trading.buyer_agents USING (firm_id = current_firm_id());

-- Earnings ledger: har commission invoice par agent ka banta hua hissa (auto).
CREATE TABLE IF NOT EXISTS trading.buyer_agent_earnings (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id               uuid NOT NULL,
    buyer_agent_id        uuid NOT NULL,
    commission_invoice_id uuid,
    buyer_party_id        uuid,
    buyer_name            text,
    gross_commission      numeric(14,2) DEFAULT 0,
    share_pct             numeric(5,2) DEFAULT 0,
    share_amount          numeric(14,2) DEFAULT 0,
    ref_no                text,
    created_at            timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_buyer_agent_earnings_firm ON trading.buyer_agent_earnings(firm_id, buyer_agent_id, created_at DESC);
ALTER TABLE trading.buyer_agent_earnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS firm_isolation_buyer_agent_earnings ON trading.buyer_agent_earnings;
CREATE POLICY firm_isolation_buyer_agent_earnings ON trading.buyer_agent_earnings USING (firm_id = current_firm_id());

-- Payouts: hamne agent ko uska hissa diya.
CREATE TABLE IF NOT EXISTS trading.buyer_agent_payouts (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id        uuid NOT NULL,
    buyer_agent_id uuid NOT NULL,
    payout_date    date DEFAULT CURRENT_DATE,
    amount         numeric(14,2) DEFAULT 0,
    mode           text,
    ref_no         text,
    notes          text,
    created_by     uuid,
    created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_buyer_agent_payouts_firm ON trading.buyer_agent_payouts(firm_id, buyer_agent_id, payout_date DESC);
ALTER TABLE trading.buyer_agent_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS firm_isolation_buyer_agent_payouts ON trading.buyer_agent_payouts;
CREATE POLICY firm_isolation_buyer_agent_payouts ON trading.buyer_agent_payouts USING (firm_id = current_firm_id());

-- Buyer (contact) ka default agent + share%.
ALTER TABLE core.contacts ADD COLUMN IF NOT EXISTS buyer_agent_id uuid;
ALTER TABLE core.contacts ADD COLUMN IF NOT EXISTS buyer_agent_share_pct numeric(5,2);
