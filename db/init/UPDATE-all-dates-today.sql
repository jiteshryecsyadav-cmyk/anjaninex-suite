-- =============================================================================
-- SAB ORDERS + BILLS KI DATE AAJ (06/06/2026) KARO
-- Kya badlega:
--   1. trading.orders.order_date      -> 2026-06-06
--   2. trading.bills.bill_date        -> 2026-06-06
--   3. accounting.vouchers.voucher_date -> 2026-06-06 (bill se bane vouchers,
--      taaki accounting reports bills se match karein)
-- Kya NAHI badlega: amounts, numbers, parties, status — kuch nahi.
-- pgAdmin Query Tool me chalao.
-- =============================================================================

BEGIN;

-- 1) Saare orders aaj ki date par
UPDATE trading.orders
SET order_date = DATE '2026-06-06',
    updated_at = now();

-- 2) Saare bills aaj ki date par
UPDATE trading.bills
SET bill_date = DATE '2026-06-06',
    updated_at = now();

-- 3) Accounting vouchers bhi same date par (warna books me purani date dikhegi)
UPDATE accounting.vouchers
SET voucher_date = DATE '2026-06-06',
    updated_at = now();

COMMIT;

-- Check karo:
SELECT order_no, order_date, status FROM trading.orders ORDER BY order_no;
SELECT bill_no, bill_date, status FROM trading.bills ORDER BY bill_no;
