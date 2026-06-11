-- ============================================================================
-- Items master ko bills + orders me use hue items se bhar do (real items).
-- Free-text item names jo bill/order lines me hain, unhe trading.items me daalo.
-- Idempotent — already-present items dobara nahi banenge.
-- ============================================================================

-- 1. BILL LINES se
INSERT INTO trading.items (firm_id, name, hsn_sac, unit, default_rate, tax_rate, is_active)
SELECT DISTINCT ON (b.firm_id, lower(bl.item_name))
       b.firm_id,
       bl.item_name,
       NULLIF(bl.hsn_sac, ''),
       COALESCE(NULLIF(bl.unit, ''), 'PCS'),
       bl.rate,
       bl.tax_rate,
       TRUE
FROM trading.bill_lines bl
JOIN trading.bills b ON b.id = bl.bill_id
WHERE bl.item_name IS NOT NULL AND btrim(bl.item_name) <> ''
  AND NOT EXISTS (
      SELECT 1 FROM trading.items i
      WHERE i.firm_id = b.firm_id AND lower(i.name) = lower(bl.item_name)
  )
ORDER BY b.firm_id, lower(bl.item_name), bl.rate DESC;

-- 2. ORDER LINES se (jo bill me nahi the)
INSERT INTO trading.items (firm_id, name, hsn_sac, unit, default_rate, tax_rate, is_active)
SELECT DISTINCT ON (o.firm_id, lower(ol.item_name))
       o.firm_id,
       ol.item_name,
       NULLIF(ol.hsn_sac, ''),
       COALESCE(NULLIF(ol.unit, ''), 'PCS'),
       ol.rate,
       COALESCE(NULLIF(ol.igst_pct, 0), ol.sgst_pct + ol.cgst_pct),
       TRUE
FROM trading.order_lines ol
JOIN trading.orders o ON o.id = ol.order_id
WHERE ol.item_name IS NOT NULL AND btrim(ol.item_name) <> ''
  AND NOT EXISTS (
      SELECT 1 FROM trading.items i
      WHERE i.firm_id = o.firm_id AND lower(i.name) = lower(ol.item_name)
  )
ORDER BY o.firm_id, lower(ol.item_name), ol.rate DESC;

-- Verify
SELECT name, hsn_sac, unit, default_rate, tax_rate FROM trading.items WHERE is_active ORDER BY name;
