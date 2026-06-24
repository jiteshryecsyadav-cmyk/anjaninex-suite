-- ============================================================================
-- Migration 56 — SCREEN-BASED CRUD PERMISSIONS (Role Permissions matrix)
-- ----------------------------------------------------------------------------
-- A NEW, self-contained screen-level permission model — SEPARATE from the
-- existing fine-grained core.permissions (module.resource.action.scope).
-- One row per app SCREEN/menu item; each role gets C/R/U/D toggles per screen.
--
-- NOTE: This stores configuration only. Actual route-guard ENFORCEMENT is a
-- separate task — these tables let admins map who-can-do-what, nothing reads
-- them for access checks yet.
--
-- RLS: core.role_permissions has NO RLS (it is firm-scoped only through the
-- role_id FK → core.roles, which IS rls-protected). We follow the SAME pattern:
--   • core.app_screens          → global catalog, no firm column, no RLS
--   • core.role_screen_permissions → firm_id kept for convenience + scoped via
--     role_id; no RLS (matches core.role_permissions).
-- ============================================================================

-- ---- Screen catalog (global, seeded; can grow) -----------------------------
CREATE TABLE IF NOT EXISTS core.app_screens (
    code        TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    route       TEXT,
    module      TEXT,
    sort_order  INT
);

-- ---- Per-role screen CRUD grid ---------------------------------------------
CREATE TABLE IF NOT EXISTS core.role_screen_permissions (
    firm_id     UUID,
    role_id     UUID NOT NULL REFERENCES core.roles(id) ON DELETE CASCADE,
    screen_code TEXT NOT NULL REFERENCES core.app_screens(code) ON DELETE CASCADE,
    can_create  BOOLEAN NOT NULL DEFAULT FALSE,
    can_read    BOOLEAN NOT NULL DEFAULT FALSE,
    can_update  BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete  BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (role_id, screen_code)
);

CREATE INDEX IF NOT EXISTS ix_role_screen_perms_role ON core.role_screen_permissions(role_id);

-- App role grants (table owner runs DDL above; app connects as namokara_app).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'namokara_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON core.app_screens TO namokara_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON core.role_screen_permissions TO namokara_app;
    END IF;
END $$;

-- ---- Seed the screen catalog (derived from this app's sidebar + routes) -----
-- Grouped/ordered like the sidebar: Dashboard, Trading, Reports, Accounting,
-- Masters (Team & Security), Active Directory (Bazaar Link), HR, Wallet,
-- Import & Migration, Core Master.
INSERT INTO core.app_screens (code, label, route, module, sort_order) VALUES
  -- Dashboard
  ('dashboard',            'Dashboard',            '/',                        'Dashboard',    10),

  -- Trading
  ('trading_parties',      'Parties',              '/trading/parties',         'Trading',      20),
  ('trading_items',        'Items',                '/trading/items',           'Trading',      21),
  ('trading_bills',        'Bills',                '/trading/bills',           'Trading',      22),
  ('trading_bill_entry',   'Bill Entry',           '/trading/bills/new',       'Trading',      23),
  ('trading_orders',       'Orders',               '/trading/orders',          'Trading',      24),
  ('trading_payments',     'Payment Receipt',      '/trading/payments',        'Trading',      25),
  ('trading_gr',           'Goods Return',         '/trading/gr',              'Trading',      26),
  ('trading_commission',   'Commission',           '/trading/commission',      'Trading',      27),

  -- Reports
  ('reports_dashboard',    'Executive Dashboard',  '/reports/dashboard',       'Reports',      30),
  ('reports_sales',        'Sales Register',       '/reports/sales-register',  'Reports',      31),
  ('reports_outstanding',  'Outstanding',          '/reports/outstanding',     'Reports',      32),
  ('reports_party_aging',  'Party Outstanding',    '/reports/party-outstanding','Reports',     33),
  ('reports_gst',          'GST Summary',          '/reports/gst',             'Reports',      34),
  ('reports_commission',   'Commission Report',    '/reports/commission',      'Reports',      35),
  ('reports_scan',         'Scan Report',          '/reports/scan',            'Reports',      36),
  ('reports_activity',     'Activity Log',         '/reports/activity',        'Reports',      37),

  -- Accounting
  ('acct_heads',           'Account Heads',        '/accounting/heads',        'Accounting',   40),
  ('acct_groups',          'Account Groups',       '/accounting/groups',       'Accounting',   41),
  ('acct_sub_groups',      'Sub Groups',           '/accounting/sub-groups',   'Accounting',   42),
  ('acct_ledgers',         'Ledger Master',        '/accounting/ledgers',      'Accounting',   43),
  ('acct_vouchers',        'Voucher Entry',        '/accounting/vouchers',     'Accounting',   44),
  ('acct_voucher_list',    'Voucher List',         '/accounting/voucher-list', 'Accounting',   45),
  ('acct_trial_balance',   'Trial Balance',        '/accounting/trial-balance','Accounting',   46),
  ('acct_profit_loss',     'Profit & Loss',        '/accounting/profit-loss',  'Accounting',   47),
  ('acct_balance_sheet',   'Balance Sheet',        '/accounting/balance-sheet','Accounting',   48),

  -- Masters / Team & Security
  ('masters_branches',     'Branches',             '/masters/branches',        'Masters',      50),
  ('masters_transporters', 'Transporters',         '/masters/transporters',    'Masters',      51),
  ('masters_users',        'Users',                '/masters/users',           'Masters',      52),
  ('masters_roles',        'Roles',                '/masters/roles',           'Masters',      53),
  ('masters_permissions',  'Role Permissions',     '/masters/permissions',     'Masters',      54),
  ('masters_credit_limits','Credit Limits',        '/masters/credit-limits',   'Masters',      55),
  ('team_security',        'Team & Security',       '/team',                    'Masters',      56),
  ('settings',             'Settings',             '/settings',                'Masters',      57),

  -- Active Directory / Bazaar Link
  ('ad_directory',         'Bazaar Link (Suppliers)','/suppliers',             'Bazaar Link',  60),
  ('ad_buyers',            'Buyers',               '/suppliers/buyers',        'Bazaar Link',  61),
  ('ad_appointments',      'Appointments',         '/suppliers/appointments',  'Bazaar Link',  62),
  ('ad_match',             'Match',                '/suppliers/match',         'Bazaar Link',  63),
  ('ad_search',            'AD Search',            '/suppliers/search',        'Bazaar Link',  64),
  ('ad_bot',              'WhatsApp Bot',          '/suppliers/bot',           'Bazaar Link',  65),

  -- HR
  ('hr_dashboard',         'HR Dashboard',         '/hr/dashboard',            'HR',           70),
  ('hr_staff',             'Staff',                '/hr/staff',                'HR',           71),
  ('hr_check_in',          'Check-In',             '/hr/check-in',             'HR',           72),
  ('hr_register',          'Attendance Register',  '/hr/register',             'HR',           73),
  ('hr_live_map',          'Live Map',             '/hr/live-map',             'HR',           74),
  ('hr_leaves',            'Leaves',               '/hr/leaves',               'HR',           75),
  ('hr_payroll',           'Payroll',              '/hr/payroll',              'HR',           76),

  -- Wallet, Import & Migration, Core Master
  ('wallet',               'Wallet & Billing',     '/wallet',                  'Wallet',       80),
  ('migration',            'Import & Migration',   '/migration',               'Import',       90),
  ('core_master',          'Core Master',          '/core-master',             'Core Master',  95)
ON CONFLICT (code) DO NOTHING;
