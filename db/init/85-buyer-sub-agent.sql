-- Buyer ka SUB-AGENT (naam + %). Sirf record + sub-agent report ke liye.
-- Koi commission/payment calculation par iska EFFECT NAHI.
ALTER TABLE core.contacts ADD COLUMN IF NOT EXISTS sub_agent     text;
ALTER TABLE core.contacts ADD COLUMN IF NOT EXISTS sub_agent_pct numeric(6,2) DEFAULT 0;
