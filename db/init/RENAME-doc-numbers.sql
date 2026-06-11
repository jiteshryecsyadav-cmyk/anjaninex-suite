-- ============================================================================
-- Purane document numbers ko naye SHORT format me rename karo
--   Bill:       JPR-BILL-0001  → JPR-1
--   Order:      ORD-001        → JPR-O1
--   Receipt:    JPR-RCT-0001   → JPR-R1
--   Payment:    JPR-PAY-0001   → JPR-P1
--   GR:         GR/2026-27/0001→ JPR-G1
--   Commission: COMM/2606/0001 → JPR-C1
-- (branch code apne aap branch se uthta hai; leading zeros hat jate hain)
-- pgAdmin: ROLLBACK; chala kar phir ye puri file Run (F5).
-- ============================================================================

BEGIN;

-- Bills: ...-BILL-0001 → CODE-1
UPDATE trading.bills b
   SET bill_no = br.code || '-' || (regexp_match(b.bill_no, '(\d+)$'))[1]::int::text
  FROM core.branches br
 WHERE br.id = b.branch_id
   AND b.bill_no ~ '-BILL-';

-- Orders: ORD-001 → CODE-O1
UPDATE trading.orders o
   SET order_no = br.code || '-O' || (regexp_match(o.order_no, '(\d+)$'))[1]::int::text
  FROM core.branches br
 WHERE br.id = o.branch_id
   AND o.order_no ~ '^ORD-';

-- Receipts: ...-RCT-0001 → CODE-R1
UPDATE trading.payments p
   SET payment_no = br.code || '-R' || (regexp_match(p.payment_no, '(\d+)$'))[1]::int::text
  FROM core.branches br
 WHERE br.id = p.branch_id
   AND p.payment_no ~ '-RCT-';

-- Payments: ...-PAY-0001 → CODE-P1
UPDATE trading.payments p
   SET payment_no = br.code || '-P' || (regexp_match(p.payment_no, '(\d+)$'))[1]::int::text
  FROM core.branches br
 WHERE br.id = p.branch_id
   AND p.payment_no ~ '-PAY-';

-- GR: GR/2026-27/0001 → CODE-G1
UPDATE trading.goods_returns g
   SET gr_no = br.code || '-G' || (regexp_match(g.gr_no, '(\d+)$'))[1]::int::text
  FROM core.branches br
 WHERE br.id = g.branch_id
   AND g.gr_no ~ '^GR/';

-- Commission: COMM/2606/0001 → CODE-C1
UPDATE trading.commission_invoices ci
   SET invoice_no = br.code || '-C' || (regexp_match(ci.invoice_no, '(\d+)$'))[1]::int::text
  FROM core.branches br
 WHERE br.id = ci.branch_id
   AND ci.invoice_no ~ '^COMM/';

COMMIT;

-- Verify — naye numbers dekho
SELECT 'bill' AS doc, bill_no AS no FROM trading.bills
UNION ALL SELECT 'order', order_no FROM trading.orders
UNION ALL SELECT 'payment', payment_no FROM trading.payments
UNION ALL SELECT 'gr', gr_no FROM trading.goods_returns
UNION ALL SELECT 'commission', invoice_no FROM trading.commission_invoices
ORDER BY 1, 2;
