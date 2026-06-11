-- =============================================================================
-- 🧹 RESET TRADING DATA — Clean slate for real data testing
-- =============================================================================
-- DELETES: bills, orders, payments, GR, commission invoices,
--          parties (supplier+buyer), transporters, items, AI cache + logs
-- KEEPS:   ledgers + sub-groups (chart of accounts), vouchers + entries,
--          firms, users, branches, roles, suppliers module data
--
-- ⚠️  Run as superuser (postgres) in pgAdmin.
-- ⚠️  Wrapped in BEGIN/COMMIT — if counts look wrong, run ROLLBACK; instead.
-- =============================================================================

BEGIN;

-- Bypass RLS for cleanup
SET LOCAL row_security = off;

-- =============================================================================
-- 📊 BEFORE counts
-- =============================================================================
SELECT '════ BEFORE CLEANUP ════' AS state;

SELECT table_name, row_count FROM (
  SELECT 1 AS ord, 'trading.bills' AS table_name, COUNT(*) AS row_count FROM trading.bills
  UNION ALL SELECT 2, 'trading.bill_lines', COUNT(*) FROM trading.bill_lines
  UNION ALL SELECT 3, 'trading.orders', COUNT(*) FROM trading.orders
  UNION ALL SELECT 4, 'trading.order_lines', COUNT(*) FROM trading.order_lines
  UNION ALL SELECT 5, 'trading.payments', COUNT(*) FROM trading.payments
  UNION ALL SELECT 6, 'trading.payment_allocations', COUNT(*) FROM trading.payment_allocations
  UNION ALL SELECT 7, 'trading.gr', COUNT(*) FROM trading.gr
  UNION ALL SELECT 8, 'trading.gr_lines', COUNT(*) FROM trading.gr_lines
  UNION ALL SELECT 9, 'trading.commission_invoices', COUNT(*) FROM trading.commission_invoices
  UNION ALL SELECT 10, 'trading.commission_invoice_lines', COUNT(*) FROM trading.commission_invoice_lines
  UNION ALL SELECT 11, 'trading.party_profiles', COUNT(*) FROM trading.party_profiles
  UNION ALL SELECT 12, 'trading.items', COUNT(*) FROM trading.items
  UNION ALL SELECT 13, 'core.transporters', COUNT(*) FROM core.transporters
  UNION ALL SELECT 14, 'core.contacts', COUNT(*) FROM core.contacts
  UNION ALL SELECT 15, 'ai.extraction_logs', COUNT(*) FROM ai.extraction_logs
  UNION ALL SELECT 16, 'ai.cache', COUNT(*) FROM ai.cache
  UNION ALL SELECT 17, 'accounting.vouchers (KEPT)', COUNT(*) FROM accounting.vouchers
  UNION ALL SELECT 18, 'accounting.ledgers (KEPT)', COUNT(*) FROM accounting.ledgers
) x ORDER BY ord;

-- =============================================================================
-- 🗑️ DELETE in FK-safe order (children first, parents last)
-- =============================================================================

-- 1️⃣ Bills + lines
DELETE FROM trading.bill_lines;
DELETE FROM trading.bills;

-- 2️⃣ Orders + lines
DELETE FROM trading.order_lines;
DELETE FROM trading.orders;

-- 3️⃣ Payments + allocations
DELETE FROM trading.payment_allocations;
DELETE FROM trading.payments;

-- 4️⃣ GR + lines
DELETE FROM trading.gr_lines;
DELETE FROM trading.gr;

-- 5️⃣ Commission invoices
DELETE FROM trading.commission_invoice_lines;
DELETE FROM trading.commission_invoices;

-- Legacy commission table (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='trading' AND table_name='commission') THEN
    DELETE FROM trading.commission;
  END IF;
END $$;

-- 6️⃣ AI extraction logs + cache (so AI scan tests fresh)
DELETE FROM ai.extraction_logs;
DELETE FROM ai.cache;

-- 7️⃣ Capture contact_ids of trading parties (we'll clean orphan contacts later)
CREATE TEMP TABLE _trading_contact_ids AS
SELECT DISTINCT contact_id FROM trading.party_profiles WHERE contact_id IS NOT NULL;

-- 8️⃣ Party profiles (supplier + buyer)
DELETE FROM trading.party_profiles;

-- 9️⃣ Items master
DELETE FROM trading.items;

-- 🔟 Transporters
DELETE FROM core.transporters;

-- 1️⃣1️⃣ Orphan contacts — only those linked to deleted trading parties
--      AND not used by suppliers module or any other reference
DELETE FROM core.contacts c
WHERE c.id IN (SELECT contact_id FROM _trading_contact_ids)
  AND NOT EXISTS (
    SELECT 1 FROM suppliers.supplier_profiles sp
    WHERE sp.contact_id = c.id
  );

DROP TABLE _trading_contact_ids;

-- =============================================================================
-- 📊 AFTER counts (everything should be 0 except KEPT items)
-- =============================================================================
SELECT '════ AFTER CLEANUP ════' AS state;

SELECT table_name, row_count FROM (
  SELECT 1 AS ord, 'trading.bills' AS table_name, COUNT(*) AS row_count FROM trading.bills
  UNION ALL SELECT 2, 'trading.bill_lines', COUNT(*) FROM trading.bill_lines
  UNION ALL SELECT 3, 'trading.orders', COUNT(*) FROM trading.orders
  UNION ALL SELECT 4, 'trading.order_lines', COUNT(*) FROM trading.order_lines
  UNION ALL SELECT 5, 'trading.payments', COUNT(*) FROM trading.payments
  UNION ALL SELECT 6, 'trading.payment_allocations', COUNT(*) FROM trading.payment_allocations
  UNION ALL SELECT 7, 'trading.gr', COUNT(*) FROM trading.gr
  UNION ALL SELECT 8, 'trading.gr_lines', COUNT(*) FROM trading.gr_lines
  UNION ALL SELECT 9, 'trading.commission_invoices', COUNT(*) FROM trading.commission_invoices
  UNION ALL SELECT 10, 'trading.commission_invoice_lines', COUNT(*) FROM trading.commission_invoice_lines
  UNION ALL SELECT 11, 'trading.party_profiles', COUNT(*) FROM trading.party_profiles
  UNION ALL SELECT 12, 'trading.items', COUNT(*) FROM trading.items
  UNION ALL SELECT 13, 'core.transporters', COUNT(*) FROM core.transporters
  UNION ALL SELECT 14, 'ai.extraction_logs', COUNT(*) FROM ai.extraction_logs
  UNION ALL SELECT 15, 'ai.cache', COUNT(*) FROM ai.cache
  UNION ALL SELECT 16, 'accounting.vouchers (KEPT)', COUNT(*) FROM accounting.vouchers
  UNION ALL SELECT 17, 'accounting.ledgers (KEPT)', COUNT(*) FROM accounting.ledgers
) x ORDER BY ord;

-- =============================================================================
-- ✅ COMMIT to apply OR run ROLLBACK to undo if counts look wrong
-- =============================================================================
COMMIT;
-- ROLLBACK;  -- ← Uncomment + comment COMMIT above if you want to undo
