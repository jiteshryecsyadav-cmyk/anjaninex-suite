-- 74: Receipt pe "paisa kisko mila" toggle
-- money_to_agency = true  → aadhat/principal model: buyer ka paisa AGENCY ko mila (Dr Cash/Bank, Cr Buyer)
-- money_to_agency = false → broker model (default): paisa seedha supplier ko gaya (Dr Supplier, Cr Buyer)

ALTER TABLE trading.payments
    ADD COLUMN IF NOT EXISTS money_to_agency boolean NOT NULL DEFAULT false;
