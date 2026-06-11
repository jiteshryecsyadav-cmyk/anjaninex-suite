-- ============================================================================
-- PERMISSIONS SEED (dobara chalane par bhi safe — duplicate skip)
-- Team & Security > Permissions grid ke checkboxes isi se aate hain.
-- pgAdmin: ROLLBACK; phir ye puri file Run (F5).
-- ============================================================================

-- 'ai' module pehle add karo — original seed isi FK par fail hua tha,
-- isliye permissions table khali reh gayi thi.
INSERT INTO core.modules VALUES ('ai', 'AI', 'sparkles', 7)
ON CONFLICT DO NOTHING;

INSERT INTO core.permissions (code, module, resource, action, scope, description) VALUES
-- Trading
('trading.bill.view.branch',     'trading', 'bill', 'view',   'branch', 'View bills in branch'),
('trading.bill.create.branch',   'trading', 'bill', 'create', 'branch', 'Create bill in branch'),
('trading.bill.edit.branch',     'trading', 'bill', 'edit',   'branch', 'Edit bill in branch'),
('trading.bill.delete.branch',   'trading', 'bill', 'delete', 'branch', 'Delete bill in branch'),
('trading.bill.approve.branch',  'trading', 'bill', 'approve','branch', 'Approve bill'),
('trading.bill.export.branch',   'trading', 'bill', 'export', 'branch', 'Export bills'),
('trading.order.view.branch',    'trading', 'order', 'view',   'branch', 'View orders'),
('trading.order.create.branch',  'trading', 'order', 'create', 'branch', 'Create order'),
('trading.order.edit.branch',    'trading', 'order', 'edit',   'branch', 'Edit order'),
('trading.order.delete.branch',  'trading', 'order', 'delete', 'branch', 'Delete order'),
('trading.payment.view.branch',  'trading', 'payment', 'view',   'branch', 'View payments'),
('trading.payment.create.branch','trading', 'payment', 'create', 'branch', 'Create payment'),
('trading.payment.edit.branch',  'trading', 'payment', 'edit',   'branch', 'Edit payment'),
('trading.payment.delete.branch','trading', 'payment', 'delete', 'branch', 'Delete payment'),
('trading.gr.view.branch',       'trading', 'gr', 'view',   'branch', 'View goods returns'),
('trading.gr.create.branch',     'trading', 'gr', 'create', 'branch', 'Create goods return'),
('trading.gr.approve.branch',    'trading', 'gr', 'approve','branch', 'Approve goods return'),
('trading.gr.delete.branch',     'trading', 'gr', 'delete', 'branch', 'Delete goods return'),
('trading.commission.view.branch',   'trading', 'commission', 'view',   'branch', 'View commission'),
('trading.commission.create.branch', 'trading', 'commission', 'create', 'branch', 'Create commission invoice'),
('trading.party.view.firm',      'trading', 'party', 'view',   'firm',   'View parties'),
('trading.party.create.firm',    'trading', 'party', 'create', 'firm',   'Create party'),
('trading.party.edit.firm',      'trading', 'party', 'edit',   'firm',   'Edit party'),
('trading.party.delete.firm',    'trading', 'party', 'delete', 'firm',   'Delete party'),
('trading.item.view.firm',       'trading', 'item', 'view',   'firm',   'View items'),
('trading.item.create.firm',     'trading', 'item', 'create', 'firm',   'Create item'),
('trading.item.edit.firm',       'trading', 'item', 'edit',   'firm',   'Edit item'),
('trading.item.delete.firm',     'trading', 'item', 'delete', 'firm',   'Delete item'),
-- Accounting
('accounting.voucher.view.branch',   'accounting', 'voucher', 'view',   'branch', 'View vouchers'),
('accounting.voucher.create.branch', 'accounting', 'voucher', 'create', 'branch', 'Create voucher'),
('accounting.voucher.edit.branch',   'accounting', 'voucher', 'edit',   'branch', 'Edit voucher'),
('accounting.voucher.delete.branch', 'accounting', 'voucher', 'delete', 'branch', 'Delete voucher'),
('accounting.ledger.view.firm',      'accounting', 'ledger',  'view',   'firm',   'View ledger'),
('accounting.ledger.create.firm',    'accounting', 'ledger',  'create', 'firm',   'Create ledger'),
('accounting.ledger.edit.firm',      'accounting', 'ledger',  'edit',   'firm',   'Edit ledger'),
('accounting.report.view.firm',      'accounting', 'report',  'view',   'firm',   'View financial reports'),
-- HR
('hr.staff.view.firm',         'hr', 'staff',  'view',   'firm', 'View all staff'),
('hr.staff.create.firm',       'hr', 'staff',  'create', 'firm', 'Add new staff'),
('hr.staff.edit.firm',         'hr', 'staff',  'edit',   'firm', 'Edit staff'),
('hr.attendance.view.firm',    'hr', 'attendance', 'view',   'firm', 'View attendance'),
('hr.attendance.viewown.self', 'hr', 'attendance', 'viewown','self', 'View own attendance'),
('hr.leave.create.self',       'hr', 'leave',  'create', 'self',   'Apply for leave'),
('hr.leave.approve.branch',    'hr', 'leave',  'approve','branch', 'Approve leaves'),
('hr.salary.view.self',        'hr', 'salary', 'view',   'self',   'View own salary'),
('hr.salary.view.firm',        'hr', 'salary', 'view',   'firm',   'View all salaries'),
-- Suppliers (Active Directory)
('suppliers.directory.view.firm',   'suppliers', 'directory', 'view',   'firm', 'View supplier directory'),
('suppliers.directory.create.firm', 'suppliers', 'directory', 'create', 'firm', 'Add supplier'),
('suppliers.directory.edit.firm',   'suppliers', 'directory', 'edit',   'firm', 'Edit supplier'),
('suppliers.wa.send.firm',          'suppliers', 'wa',        'send',   'firm', 'Send WhatsApp'),
-- Reports
('reports.report.view.firm',   'reports', 'report', 'view',   'firm', 'View reports'),
('reports.report.export.firm', 'reports', 'report', 'export', 'firm', 'Export reports'),
-- AI
('ai.bill_scan.use.branch',    'ai', 'bill_scan',    'use', 'branch', 'AI bill scanner'),
('ai.voice_order.use.branch',  'ai', 'voice_order',  'use', 'branch', 'AI voice order'),
('ai.nl_search.use.firm',      'ai', 'nl_search',    'use', 'firm',   'AI smart search'),
-- Settings / Team
('settings.user.view.firm',    'settings', 'user',  'view',   'firm', 'View users'),
('settings.user.create.firm',  'settings', 'user',  'create', 'firm', 'Invite user'),
('settings.role.view.firm',    'settings', 'role',  'view',   'firm', 'View roles'),
('settings.role.edit.firm',    'settings', 'role',  'edit',   'firm', 'Edit roles'),
('settings.branch.view.firm',  'settings', 'branch','view',   'firm', 'View branches'),
('settings.branch.create.firm','settings', 'branch','create', 'firm', 'Create branch'),
('settings.wallet.view.firm',     'settings', 'wallet', 'view',     'firm', 'View wallet'),
('settings.wallet.recharge.firm', 'settings', 'wallet', 'recharge', 'firm', 'Recharge wallet')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- GAP FILL — har screen me poore C/R/U/D boxes (Trading › Payment jaise)
-- ============================================================================
INSERT INTO core.permissions (code, module, resource, action, scope, description) VALUES
-- Accounting
('accounting.ledger.delete.firm',    'accounting', 'ledger', 'delete', 'firm', 'Delete ledger'),
('accounting.report.export.firm',    'accounting', 'report', 'export', 'firm', 'Export financial reports'),
-- HR
('hr.staff.delete.firm',       'hr', 'staff',      'delete', 'firm', 'Delete staff'),
('hr.attendance.create.firm',  'hr', 'attendance', 'create', 'firm', 'Mark attendance'),
('hr.attendance.edit.firm',    'hr', 'attendance', 'edit',   'firm', 'Edit attendance'),
('hr.leave.view.firm',         'hr', 'leave',      'view',   'firm', 'View all leaves'),
('hr.leave.edit.firm',         'hr', 'leave',      'edit',   'firm', 'Edit leave'),
('hr.leave.delete.firm',       'hr', 'leave',      'delete', 'firm', 'Delete leave'),
('hr.salary.edit.firm',        'hr', 'salary',     'edit',   'firm', 'Edit salary structure'),
-- Suppliers
('suppliers.directory.delete.firm', 'suppliers', 'directory', 'delete', 'firm', 'Delete supplier/buyer'),
-- Settings / Team
('settings.branch.edit.firm',   'settings', 'branch', 'edit',   'firm', 'Edit branch'),
('settings.branch.delete.firm', 'settings', 'branch', 'delete', 'firm', 'Delete branch'),
('settings.role.create.firm',   'settings', 'role',   'create', 'firm', 'Create role'),
('settings.role.delete.firm',   'settings', 'role',   'delete', 'firm', 'Delete role'),
('settings.user.edit.firm',     'settings', 'user',   'edit',   'firm', 'Edit user'),
('settings.user.delete.firm',   'settings', 'user',   'delete', 'firm', 'Deactivate user'),
-- Trading
('trading.commission.edit.branch',   'trading', 'commission', 'edit',   'branch', 'Edit commission invoice'),
('trading.commission.delete.branch', 'trading', 'commission', 'delete', 'branch', 'Delete commission invoice'),
('trading.gr.edit.branch',           'trading', 'gr',         'edit',   'branch', 'Edit goods return')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- FINAL FILL — ab HAR row me pure 4 boxes (C R U D), Trading › Party jaise
-- ============================================================================
INSERT INTO core.permissions (code, module, resource, action, scope, description) VALUES
-- Accounting › Report
('accounting.report.create.firm', 'accounting', 'report', 'create', 'firm', 'Create custom report'),
('accounting.report.edit.firm',   'accounting', 'report', 'edit',   'firm', 'Edit report settings'),
('accounting.report.delete.firm', 'accounting', 'report', 'delete', 'firm', 'Delete saved report'),
-- HR › Attendance / Salary
('hr.attendance.delete.firm', 'hr', 'attendance', 'delete', 'firm', 'Delete attendance entry'),
('hr.salary.create.firm',     'hr', 'salary',     'create', 'firm', 'Create salary structure'),
('hr.salary.delete.firm',     'hr', 'salary',     'delete', 'firm', 'Delete salary structure'),
-- Reports › Report
('reports.report.create.firm', 'reports', 'report', 'create', 'firm', 'Create saved report'),
('reports.report.edit.firm',   'reports', 'report', 'edit',   'firm', 'Edit saved report'),
('reports.report.delete.firm', 'reports', 'report', 'delete', 'firm', 'Delete saved report'),
-- Settings › Wallet
('settings.wallet.create.firm', 'settings', 'wallet', 'create', 'firm', 'Create wallet request'),
('settings.wallet.edit.firm',   'settings', 'wallet', 'edit',   'firm', 'Manage wallet'),
('settings.wallet.delete.firm', 'settings', 'wallet', 'delete', 'firm', 'Cancel wallet request')
ON CONFLICT (code) DO NOTHING;

-- Verify
SELECT count(*) AS total_permissions FROM core.permissions;
