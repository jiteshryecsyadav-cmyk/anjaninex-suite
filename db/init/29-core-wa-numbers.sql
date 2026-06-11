-- ============================================================================
-- Migration 29 — 2 WhatsApp numbers core.contacts me (COMMON, single source)
-- Pehle ye supplier_profiles/buyer_profiles.wa_phone me the. Ab common ban gaye:
-- har form (Core Master, Trading, AD) me same, bot bhi yahin se padhega.
-- ============================================================================

BEGIN;

ALTER TABLE core.contacts ADD COLUMN IF NOT EXISTS wa_supplier TEXT;
ALTER TABLE core.contacts ADD COLUMN IF NOT EXISTS wa_buyer    TEXT;

-- Purana data le aao (jahan AD profiles me wa_phone tha).
UPDATE core.contacts c
   SET wa_supplier = sp.wa_phone
  FROM suppliers.supplier_profiles sp
 WHERE sp.contact_id = c.id AND sp.wa_phone IS NOT NULL AND sp.wa_phone <> ''
   AND (c.wa_supplier IS NULL OR c.wa_supplier = '');

UPDATE core.contacts c
   SET wa_buyer = bp.wa_phone
  FROM suppliers.buyer_profiles bp
 WHERE bp.contact_id = c.id AND bp.wa_phone IS NOT NULL AND bp.wa_phone <> ''
   AND (c.wa_buyer IS NULL OR c.wa_buyer = '');

COMMIT;

SELECT 'migration 29-core-wa-numbers complete' AS status;
