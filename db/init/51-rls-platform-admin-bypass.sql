-- ============================================================================
-- 51 — Platform-admin (super admin) RLS bypass for firm-scoped tables.
--
-- Problem: super admin ka current_firm_id KHALI hota hai. "Add Firm" me jab naye
-- firm ke branch / role / chart-of-accounts insert hote hain (aur FORCE RLS ke
-- under FK checks chalte hain), to ye policies block kar deti thi:
--   - 42501 insufficient_privilege  (insert WITH CHECK fail)
--   - branch FK "valid nahi" (FK check ko branch row dikhta hi nahi)
--
-- core.users me pehle se is_platform_admin bypass tha; baaki tables me nahi.
-- Yahan branches/roles/contacts/departments + accounting.* ki policies me wahi
-- bypass add karte hain. Normal firms par koi asar nahi (firm_id = current wala
-- branch unchanged); sirf super admin (is_platform_admin='true') ko cross-firm
-- write/read milta hai — jo "Add Firm" ke liye zaroori hai.
-- ============================================================================

-- ---------- core.branches ----------
DROP POLICY IF EXISTS firm_isolation_branches ON core.branches;
CREATE POLICY firm_isolation_branches ON core.branches
  USING      (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

-- ---------- core.departments ----------
DROP POLICY IF EXISTS firm_isolation_departments ON core.departments;
CREATE POLICY firm_isolation_departments ON core.departments
  USING      (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

-- ---------- core.contacts ----------
DROP POLICY IF EXISTS firm_isolation_contacts ON core.contacts;
CREATE POLICY firm_isolation_contacts ON core.contacts
  USING      (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

-- ---------- core.roles (system roles sab ko readable) ----------
DROP POLICY IF EXISTS firm_isolation_roles ON core.roles;
CREATE POLICY firm_isolation_roles ON core.roles
  USING      (firm_id = core.current_firm_id() OR (firm_id IS NULL AND is_system = true) OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

-- ---------- accounting.* (chart of accounts) ----------
DROP POLICY IF EXISTS firm_isolation_heads ON accounting.account_heads;
CREATE POLICY firm_isolation_heads ON accounting.account_heads
  USING      (firm_id = current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (firm_id = current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

DROP POLICY IF EXISTS firm_isolation_groups ON accounting.account_groups;
CREATE POLICY firm_isolation_groups ON accounting.account_groups
  USING      (firm_id = current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (firm_id = current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

DROP POLICY IF EXISTS firm_isolation_sub_groups ON accounting.sub_groups;
CREATE POLICY firm_isolation_sub_groups ON accounting.sub_groups
  USING      (firm_id = current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (firm_id = current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

DROP POLICY IF EXISTS firm_isolation_ledgers ON accounting.ledgers;
CREATE POLICY firm_isolation_ledgers ON accounting.ledgers
  USING      (firm_id = current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (firm_id = current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

DROP POLICY IF EXISTS firm_isolation_vouchers ON accounting.vouchers;
CREATE POLICY firm_isolation_vouchers ON accounting.vouchers
  USING      (firm_id = current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (firm_id = current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

SELECT 'platform-admin RLS bypass added ✓ (branches/roles/contacts/departments/accounting)' AS status;
