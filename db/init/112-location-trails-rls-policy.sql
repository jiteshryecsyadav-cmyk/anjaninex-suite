-- ============================================================================
-- 112: hr.location_trails par RLS POLICY thi hi nahi — har ping hamesha reject
-- ============================================================================
-- RLS ON tha par koi policy nahi = Postgres sab kuch DENY kar deta hai.
-- Isliye staff ki live-location ping (42501) girti rahi aur Live Map/Trails
-- hamesha khali rahe — native app se bhi kabhi ek row nahi bani.
-- Baki HR tables jaisa hi pattern: firm apni hi rows dekhe/likhe.

DROP POLICY IF EXISTS location_trails_firm_iso ON hr.location_trails;
CREATE POLICY location_trails_firm_iso ON hr.location_trails
    USING (firm_id = core.current_firm_id())
    WITH CHECK (firm_id = core.current_firm_id());

SELECT 'location_trails RLS policy ✓' AS status;
