-- 69: hr.leave_balances pe RLS ENABLED tha par firm-isolation POLICY missing thi.
-- RLS enabled + no policy = default-deny -> INSERT/SELECT sab block (error 42501 insufficient_privilege).
-- Isse HR me naya staff save karne par employee to banta tha par leave_balances insert fail hota tha.
-- Missing policy dobara banao (idempotent).

DROP POLICY IF EXISTS firm_iso_lv_bal ON hr.leave_balances;
CREATE POLICY firm_iso_lv_bal ON hr.leave_balances USING (
    EXISTS (SELECT 1 FROM hr.employee_profiles e
            WHERE e.id = leave_balances.employee_id AND e.firm_id = current_firm_id()));
