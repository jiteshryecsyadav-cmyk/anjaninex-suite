-- ============================================================================
-- 109: SURAKSHA — user-management ka apna permission (staff khud ko malik na bana le)
-- ============================================================================
-- Pehle /api/core/users par koi permission-check thi hi nahi: koi bhi staff apne
-- aap ko super_admin bana kar POORE PLATFORM ka data padh sakta tha. Ab ye
-- permission chahiye — aur wo sirf firm owner/admin ke paas hai.
-- NOTE: module 'core' hai hi nahi (core.modules me sirf accounting/ai/hr/platform/
-- reports/settings/suppliers/trading) — isliye 'settings' module me rakha hai.

INSERT INTO core.permissions (code, module, resource, action, scope, description) VALUES
  ('settings.user.manage.firm', 'settings', 'user', 'manage', 'firm', 'Staff logins banana/badalna/password reset')
ON CONFLICT (code) DO NOTHING;

-- Owner/admin/super-admin ko de do — per-firm banayi gayi copies ko bhi (code se match)
INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM core.roles r, core.permissions p
WHERE p.code = 'settings.user.manage.firm'
  AND r.code IN ('super_admin', 'firm_owner', 'firm_admin')
ON CONFLICT DO NOTHING;

SELECT 'user-admin permission ready ✓ (' ||
       (SELECT count(*) FROM core.role_permissions rp JOIN core.permissions p ON p.id = rp.permission_id
         WHERE p.code = 'settings.user.manage.firm')::text || ' roles)' AS status;
