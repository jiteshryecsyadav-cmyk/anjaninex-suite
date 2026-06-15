-- ============================================================================
-- 46-rls-catalog-suppliers.sql
-- SECURITY FIX (cross-firm leak): the Product Catalog tables had NO RLS at all:
--   suppliers.varieties (has firm_id), suppliers.variety_rates, suppliers.variety_photos
--   (child tables — no firm_id, scoped via parent variety).
-- Also hardens the 4 existing suppliers policies that had USING but no WITH CHECK
-- (so a row could be inserted/updated with another firm's firm_id).
-- Idempotent. Run as postgres superuser.
-- ============================================================================

BEGIN;

-- ---------- 1. varieties: own firm_id ----------
ALTER TABLE suppliers.varieties ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers.varieties FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS firm_isolation_varieties ON suppliers.varieties;
CREATE POLICY firm_isolation_varieties ON suppliers.varieties
  USING       (firm_id = core.current_firm_id()
               OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK  (firm_id = core.current_firm_id()
               OR current_setting('app.is_platform_admin', true) = 'true');

-- ---------- 2. variety_rates: scoped via parent variety ----------
ALTER TABLE suppliers.variety_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers.variety_rates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS firm_isolation_variety_rates ON suppliers.variety_rates;
CREATE POLICY firm_isolation_variety_rates ON suppliers.variety_rates
  USING       (EXISTS (SELECT 1 FROM suppliers.varieties v
                       WHERE v.id = variety_rates.variety_id AND v.firm_id = core.current_firm_id())
               OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK  (EXISTS (SELECT 1 FROM suppliers.varieties v
                       WHERE v.id = variety_rates.variety_id AND v.firm_id = core.current_firm_id())
               OR current_setting('app.is_platform_admin', true) = 'true');

-- ---------- 3. variety_photos: scoped via parent variety ----------
ALTER TABLE suppliers.variety_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers.variety_photos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS firm_isolation_variety_photos ON suppliers.variety_photos;
CREATE POLICY firm_isolation_variety_photos ON suppliers.variety_photos
  USING       (EXISTS (SELECT 1 FROM suppliers.varieties v
                       WHERE v.id = variety_photos.variety_id AND v.firm_id = core.current_firm_id())
               OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK  (EXISTS (SELECT 1 FROM suppliers.varieties v
                       WHERE v.id = variety_photos.variety_id AND v.firm_id = core.current_firm_id())
               OR current_setting('app.is_platform_admin', true) = 'true');

-- ---------- 4. Harden existing suppliers policies: add WITH CHECK ----------
DROP POLICY IF EXISTS firm_isolation_sup_cat  ON suppliers.categories;
CREATE POLICY firm_isolation_sup_cat ON suppliers.categories
  USING       (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK  (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

DROP POLICY IF EXISTS firm_isolation_sup_prof ON suppliers.supplier_profiles;
CREATE POLICY firm_isolation_sup_prof ON suppliers.supplier_profiles
  USING       (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK  (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

DROP POLICY IF EXISTS firm_isolation_photos ON suppliers.photos;
CREATE POLICY firm_isolation_photos ON suppliers.photos
  USING       (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK  (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

DROP POLICY IF EXISTS firm_isolation_rates ON suppliers.rates;
CREATE POLICY firm_isolation_rates ON suppliers.rates
  USING       (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK  (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

COMMIT;

SELECT 'migration 46-rls-catalog-suppliers complete' AS status;
