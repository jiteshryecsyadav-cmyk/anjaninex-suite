-- ============================================================================
-- ⚠️ TRADING DEMO CLEANUP — sirf Trading ka demo data
-- DELETE karega: orders, bills, payments, GR, commission, ITEMS, PARTIES
--                (+ unke contacts + party ledgers + trading-se-bane vouchers)
-- NAHI chhuega: AD suppliers/buyers, HR staff, login/users, firm, branches,
--               chart of accounts, manual accounting vouchers, wallet.
-- pgAdmin me puri file paste karke Run (F5). Wapas nahi aayega.
-- ============================================================================

BEGIN;

DO $$
DECLARE v_firm uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';   -- Namokara demo firm
BEGIN

  -- 1) TRADING TRANSACTIONS (FK-safe order; lines CASCADE se khud saaf)
  DELETE FROM trading.commission_invoices WHERE firm_id = v_firm;  -- lines cascade
  DELETE FROM trading.commission          WHERE firm_id = v_firm;  -- (legacy table)
  DELETE FROM trading.payments            WHERE firm_id = v_firm;  -- allocations cascade
  DELETE FROM trading.goods_returns       WHERE firm_id = v_firm;  -- gr lines cascade
  DELETE FROM trading.gr                  WHERE firm_id = v_firm;  -- (legacy gr)
  DELETE FROM trading.bills               WHERE firm_id = v_firm;  -- bill_lines cascade
  DELETE FROM trading.orders              WHERE firm_id = v_firm;  -- order_lines cascade

  -- 2) Trading se auto-bane accounting vouchers (manual vouchers bache rahenge)
  DELETE FROM accounting.voucher_lines WHERE voucher_id IN
    (SELECT id FROM accounting.vouchers WHERE firm_id = v_firm AND source_module = 'trading');
  DELETE FROM accounting.vouchers WHERE firm_id = v_firm AND source_module = 'trading';

  -- 3) ITEMS master
  DELETE FROM trading.items WHERE firm_id = v_firm;

  -- 4) PARTIES — pehle unke debtor/creditor ledgers, fir profiles, fir contacts
  --    (party contact ids profiles delete hone se PEHLE pakad lo)
  CREATE TEMP TABLE _party_contacts AS
    SELECT contact_id FROM trading.party_profiles WHERE firm_id = v_firm;

  DELETE FROM accounting.voucher_lines WHERE ledger_id IN (
    SELECT id FROM accounting.ledgers
    WHERE firm_id = v_firm AND contact_id IN (SELECT contact_id FROM _party_contacts));
  DELETE FROM accounting.ledgers
   WHERE firm_id = v_firm
     AND contact_id IN (SELECT contact_id FROM _party_contacts);

  DELETE FROM trading.party_profiles WHERE firm_id = v_firm;

  -- Contacts: sirf wo delete jo AD supplier/buyer ya HR employee NAHI hain
  DELETE FROM core.contacts c
   WHERE c.firm_id = v_firm
     AND c.id IN (SELECT contact_id FROM _party_contacts)
     AND NOT EXISTS (SELECT 1 FROM suppliers.supplier_profiles sp WHERE sp.contact_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM suppliers.buyer_profiles    bp WHERE bp.contact_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM hr.employee_profiles        ep WHERE ep.contact_id = c.id);

  DROP TABLE _party_contacts;

END $$;

COMMIT;

-- Verify — sab 0 hone chahiye (parties/items/transactions), AD/HR untouched
SELECT
  (SELECT count(*) FROM trading.orders)          AS orders,
  (SELECT count(*) FROM trading.bills)           AS bills,
  (SELECT count(*) FROM trading.payments)        AS payments,
  (SELECT count(*) FROM trading.goods_returns)   AS goods_returns,
  (SELECT count(*) FROM trading.items)           AS items,
  (SELECT count(*) FROM trading.party_profiles)  AS parties,
  (SELECT count(*) FROM suppliers.supplier_profiles) AS ad_suppliers_SAFE,
  (SELECT count(*) FROM suppliers.buyer_profiles)    AS ad_buyers_SAFE,
  (SELECT count(*) FROM hr.employee_profiles)        AS hr_staff_SAFE;
