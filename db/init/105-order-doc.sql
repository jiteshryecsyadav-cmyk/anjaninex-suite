-- ============================================================================
-- 105: Trading orders par DOCUMENT/PHOTO ka pakka ghar
-- ============================================================================
-- Pehle "Upload Order/PO" sirf screen par tha — save hi nahi hota tha.
-- Ab order ke saath doc/photo ka URL save hota hai. Bazaar-approval se bana order
-- apni STOCK-PHOTO ke saath aata hai — dhundhna nahi padta kaunsi photo ka sauda tha.

ALTER TABLE trading.orders
  ADD COLUMN IF NOT EXISTS doc_url  TEXT,
  ADD COLUMN IF NOT EXISTS doc_name TEXT;

SELECT 'order doc ready ✓' AS status;
