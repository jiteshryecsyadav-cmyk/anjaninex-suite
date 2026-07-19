-- Buyer ka yearly INCENTIVE % (taxable amt par). Sirf record + incentive report.
ALTER TABLE core.contacts ADD COLUMN IF NOT EXISTS incentive_pct numeric(6,2) DEFAULT 0;
