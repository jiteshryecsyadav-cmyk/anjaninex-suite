-- ============================================================================
-- Transporter demo data cleanup — jo kisi bill/order me use NAHI hua wo delete.
-- (Pehle 36-order-cd-type.sql chala lena — usme orders.transporter_id banta hai)
-- pgAdmin: ROLLBACK; phir ye file Run (F5).
-- ============================================================================

BEGIN;

DELETE FROM core.transporters t
 WHERE NOT EXISTS (SELECT 1 FROM trading.bills  b WHERE b.transporter_id = t.id)
   AND NOT EXISTS (SELECT 1 FROM trading.orders o WHERE o.transporter_id = t.id);

COMMIT;

-- Verify — 0 aana chahiye (sab demo the, koi use nahi hua tha)
SELECT count(*) AS transporters_bache FROM core.transporters;
