-- ============================================================================
-- 109: SURAKSHA — user-management ka apna permission (staff khud ko malik na bana le)
-- ============================================================================
-- Pehle /api/core/users par koi permission-check thi hi nahi: koi bhi staff apne
-- aap ko super_admin bana kar POORE PLATFORM ka data padh sakta tha. Ab ye
-- permission chahiye — aur wo sirf firm owner/admin ke paas hai.

INSERT INTO core.permissions (code, module, resource, action, scope, description) VALUES
  ('core.user.manage.firm', 'core', 'user', 'manage', 'firm', 'Staff logins banana/badalna/password reset')
ON CONFLICT (code) DO NOTHING;

-- Super admin + firm owner + firm admin ko de do (baki kisi ko nahi)
INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM core.roles r, core.permissions p
WHERE p.code = 'core.user.manage.firm'
  AND r.code IN ('super_admin', 'firm_owner', 'firm_admin')
ON CONFLICT DO NOTHING;

SELECT 'user-admin permission ready ✓' AS status;
