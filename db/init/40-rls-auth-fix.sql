-- ============================================================================
-- 40 — RLS auth-path fix (login + super-admin under non-superuser namokara_app)
-- ----------------------------------------------------------------------------
-- 11-p0-fixes.sql ne saari policies ko strict `firm_id = current_firm_id()`
-- bana diya. Ye production (namokara_app, RLS active) me todta hai:
--   (a) LOGIN — us waqt tenant context set nahi hota (user abhi auth nahi hua),
--   (b) SUPER-ADMIN — uski koi firm nahi (firm_id NULL),
--   (c) SYSTEM ROLES — sabhi roles firm_id NULL hain -> kisi ko dikhte hi nahi.
-- Dev me `postgres` superuser tha -> RLS bypass -> ye kabhi pakda nahi gaya.
--
-- Fix: sirf AUTH-PATH tables (roles, users, sessions, user_roles) me
--   no-context / platform-admin / system-role escape add karo.
--   Firm ke DATA tables (trading/accounting/...) STRICT hi rehte hain —
--   un par koi change nahi (firm-user ka context hamesha set hota hai).
-- Idempotent: ALTER POLICY (policies pehle se maujood hain).
-- ============================================================================

-- roles: system roles (firm_id NULL, is_system) sabko dikhe; firm roles scoped
ALTER POLICY roles_firm_iso ON core.roles
  USING (firm_id = core.current_firm_id()
         OR (firm_id IS NULL AND is_system = true)
         OR core.current_firm_id() IS NULL);

-- users: login bootstrap (no context) + super-admin (is_platform_admin)
ALTER POLICY users_firm_iso ON core.users
  USING (firm_id = core.current_firm_id()
         OR current_setting('app.is_platform_admin', true) = 'true'
         OR core.current_firm_id() IS NULL)
  WITH CHECK (firm_id = core.current_firm_id()
         OR current_setting('app.is_platform_admin', true) = 'true'
         OR core.current_firm_id() IS NULL);

-- sessions: login INSERT (no context) + super-admin
ALTER POLICY sessions_firm_iso ON core.sessions
  USING (EXISTS (SELECT 1 FROM core.users u
                 WHERE u.id = core.sessions.user_id AND u.firm_id = core.current_firm_id())
         OR core.current_firm_id() IS NULL)
  WITH CHECK (EXISTS (SELECT 1 FROM core.users u
                 WHERE u.id = core.sessions.user_id AND u.firm_id = core.current_firm_id())
         OR core.current_firm_id() IS NULL);

-- user_roles: login read (no context) + super-admin
ALTER POLICY user_roles_firm_iso ON core.user_roles
  USING (EXISTS (SELECT 1 FROM core.users u
                 WHERE u.id = core.user_roles.user_id AND u.firm_id = core.current_firm_id())
         OR core.current_firm_id() IS NULL)
  WITH CHECK (EXISTS (SELECT 1 FROM core.users u
                 WHERE u.id = core.user_roles.user_id AND u.firm_id = core.current_firm_id())
         OR core.current_firm_id() IS NULL);

SELECT 'RLS auth-path fix applied ✓ (roles/users/sessions/user_roles)' AS status;
