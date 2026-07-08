-- 64: Cheque handover me buyer name bhi (report ke liye)
ALTER TABLE trading.cheque_handovers ADD COLUMN IF NOT EXISTS buyer_name text;
