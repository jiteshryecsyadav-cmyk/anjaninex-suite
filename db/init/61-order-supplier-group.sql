-- 61: Order par supplier group note (sister-concern). Firm baad me bill par pakki hogi.
ALTER TABLE trading.orders ADD COLUMN IF NOT EXISTS supplier_group_name text;
