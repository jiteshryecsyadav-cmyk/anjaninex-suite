-- =============================================================================
-- 🔍 DIAGNOSE — "Bills gayab ho gaye" check (SIRF PADHTA HAI, kuch delete nahi karta)
-- =============================================================================
-- pgAdmin me postgres (superuser) se chalao. Poora select karke Run (F5).
-- Har query ka jawab kya matlab rakhta hai wo comment me likha hai.
-- =============================================================================

SET LOCAL row_security = off;   -- RLS hata ke SAARA data dekhne ke liye

-- 1) KUL BILLS DB ME KITNE HAIN? (firm ka koi filter nahi)
--    >0 aaya  = data SAFE hai, sirf galat firm/branch dikh rahi hai
--    0 aaya   = data sach me delete hua hai
SELECT '1. TOTAL BILLS (all firms)' AS check, COUNT(*) AS cnt FROM trading.bills;

-- 2) FIRM-WISE BREAKUP — kis firm me kitne bills hain
SELECT '2. FIRM WISE' AS check,
       f.id   AS firm_id,
       f.name AS firm_name,
       COUNT(b.id)                    AS bills,
       COALESCE(SUM(b.total), 0)      AS bill_amount
FROM   core.firms f
LEFT   JOIN trading.bills b ON b.firm_id = f.id
GROUP  BY f.id, f.name
ORDER  BY bills DESC;

-- 3) SOFT-DELETED to nahi ho gaye? (deleted_at bhara hua)
SELECT '3. SOFT DELETED' AS check,
       COUNT(*) FILTER (WHERE deleted_at IS NULL) AS active,
       COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS deleted
FROM   trading.bills;

-- 4) STATUS WISE — sab 'cancelled' to nahi ho gaye
SELECT '4. STATUS WISE' AS check, status, COUNT(*) AS cnt
FROM   trading.bills GROUP BY status ORDER BY cnt DESC;

-- 5) SABSE NAYA aur SABSE PURANA bill — kab tak entry hui thi
SELECT '5. RANGE' AS check,
       MIN(bill_date) AS pehla_bill,
       MAX(bill_date) AS aakhri_bill,
       MAX(created_at) AS aakhri_entry_kab_hui
FROM   trading.bills;

-- 6) BAAKI TRADING DATA bhi gaya ya sirf bills?
--    Agar parties/orders bhi 0 hain to reset script chala tha.
SELECT '6. OTHER TABLES' AS check, t AS table_name, c AS cnt FROM (
  SELECT 'trading.party_profiles' AS t, COUNT(*) AS c FROM trading.party_profiles
  UNION ALL SELECT 'trading.orders',    COUNT(*) FROM trading.orders
  UNION ALL SELECT 'trading.payments',  COUNT(*) FROM trading.payments
  UNION ALL SELECT 'trading.bill_lines',COUNT(*) FROM trading.bill_lines
  UNION ALL SELECT 'trading.items',     COUNT(*) FROM trading.items
  UNION ALL SELECT 'core.contacts',     COUNT(*) FROM core.contacts
) x ORDER BY t;

-- 7) AAPKA LOGIN KIS FIRM PAR HAI — screenshot wali "Riddhi Agency"
SELECT '7. FIRMS LIST' AS check, id, name, created_at
FROM   core.firms ORDER BY created_at;

-- =============================================================================
-- 👉 NATIJA KAISE PADHEN:
--    Query 1 me cnt > 0  → DATA SAFE. Query 2 dekho: bills kis firm me hain.
--                          App ke top-bar 🏬 firm-switcher se us firm par jao.
--    Query 1 me cnt = 0  → Query 6 dekho. Agar parties/orders bhi 0 →
--                          21-reset-trading-data.sql chal gaya tha.
--                          Us case me server ka PostgreSQL backup chahiye hoga.
-- =============================================================================
