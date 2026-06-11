-- ============================================================================
-- Namokara Suite — Core Tables (Users, RBAC, Branches, Contacts)
-- ============================================================================

CREATE TABLE core.branches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    code            TEXT NOT NULL,
    name            TEXT NOT NULL,
    address         TEXT,
    city            TEXT,
    state           TEXT,
    pincode         TEXT,
    phone           TEXT,
    email           TEXT,
    latitude        NUMERIC(9,6),
    longitude       NUMERIC(9,6),
    gst_state_code  TEXT,
    bill_prefix     TEXT,
    voucher_prefix  TEXT,
    is_head_office  BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (firm_id, code)
);

CREATE TABLE core.departments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    branch_id       UUID REFERENCES core.branches(id),
    name            TEXT NOT NULL,
    code            TEXT,
    head_user_id    UUID,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE core.users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID REFERENCES platform.firms(id) ON DELETE CASCADE,
    username        TEXT NOT NULL,
    email           TEXT,
    phone           TEXT,
    full_name       TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    default_branch_id UUID REFERENCES core.branches(id),
    department_id   UUID REFERENCES core.departments(id),
    can_view_all_branches BOOLEAN DEFAULT FALSE,
    requires_2fa    BOOLEAN DEFAULT FALSE,
    totp_secret     TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    is_locked       BOOLEAN DEFAULT FALSE,
    locked_until    TIMESTAMPTZ,
    last_login_at   TIMESTAMPTZ,
    avatar_url      TEXT,
    locale          TEXT DEFAULT 'en-IN',
    theme           TEXT DEFAULT 'light',
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX idx_users_firm_username ON core.users(firm_id, username);
CREATE INDEX idx_users_email ON core.users(email) WHERE email IS NOT NULL;

CREATE TABLE core.user_branch_access (
    user_id         UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES core.branches(id) ON DELETE CASCADE,
    is_default      BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (user_id, branch_id)
);

CREATE TABLE core.sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    device_info     JSONB,
    ip_address      INET,
    user_agent      TEXT,
    last_seen_at    TIMESTAMPTZ DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_sessions_user_active ON core.sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_token_hash ON core.sessions(refresh_token_hash);

-- =================================================
-- RBAC
-- =================================================

CREATE TABLE core.modules (
    code            TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    icon            TEXT,
    sort_order      INT
);

INSERT INTO core.modules VALUES
('trading',    'Trading',    'shopping-cart', 1),
('accounting', 'Accounting', 'book',          2),
('suppliers',  'Suppliers',  'truck',         3),
('hr',         'HR',         'users',         4),
('reports',    'Reports',    'chart-bar',     5),
('settings',   'Settings',   'cog',           6),
('platform',   'Platform',   'shield',        99);

CREATE TABLE core.permissions (
    id              BIGSERIAL PRIMARY KEY,
    code            TEXT UNIQUE NOT NULL,
    module          TEXT NOT NULL REFERENCES core.modules(code),
    resource        TEXT NOT NULL,
    action          TEXT NOT NULL,
    scope           TEXT NOT NULL,
    description     TEXT,
    is_dangerous    BOOLEAN DEFAULT FALSE,
    requires_2fa    BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Seed essential permissions
INSERT INTO core.permissions (code, module, resource, action, scope, description) VALUES
-- Trading
('trading.bill.view.branch',     'trading', 'bill', 'view',   'branch', 'View bills in branch'),
('trading.bill.create.branch',   'trading', 'bill', 'create', 'branch', 'Create bill in branch'),
('trading.bill.edit.branch',     'trading', 'bill', 'edit',   'branch', 'Edit bill in branch'),
('trading.bill.delete.branch',   'trading', 'bill', 'delete', 'branch', 'Delete bill in branch'),
('trading.bill.approve.branch',  'trading', 'bill', 'approve','branch', 'Approve bill'),
('trading.bill.export.branch',   'trading', 'bill', 'export', 'branch', 'Export bills'),
('trading.payment.view.branch',  'trading', 'payment', 'view',   'branch', 'View payments'),
('trading.payment.create.branch','trading', 'payment', 'create', 'branch', 'Create payment'),
('trading.party.view.firm',      'trading', 'party', 'view',   'firm',   'View parties'),
('trading.party.create.firm',    'trading', 'party', 'create', 'firm',   'Create party'),
('trading.party.edit.firm',      'trading', 'party', 'edit',   'firm',   'Edit party'),
-- Accounting
('accounting.voucher.view.branch',   'accounting', 'voucher', 'view',   'branch', 'View vouchers'),
('accounting.voucher.create.branch', 'accounting', 'voucher', 'create', 'branch', 'Create voucher'),
('accounting.voucher.delete.branch', 'accounting', 'voucher', 'delete', 'branch', 'Delete voucher'),
('accounting.ledger.view.firm',      'accounting', 'ledger',  'view',   'firm',   'View ledger'),
('accounting.report.view.firm',      'accounting', 'report',  'view',   'firm',   'View financial reports'),
-- HR
('hr.staff.view.firm',         'hr', 'staff',  'view',   'firm', 'View all staff'),
('hr.staff.create.firm',       'hr', 'staff',  'create', 'firm', 'Add new staff'),
('hr.attendance.view.firm',    'hr', 'attendance', 'view',   'firm', 'View attendance'),
('hr.attendance.viewown.self', 'hr', 'attendance', 'viewown','self', 'View own attendance'),
('hr.leave.create.self',       'hr', 'leave',  'create', 'self',   'Apply for leave'),
('hr.leave.approve.branch',    'hr', 'leave',  'approve','branch', 'Approve leaves'),
('hr.salary.view.self',        'hr', 'salary', 'view',   'self',   'View own salary'),
('hr.salary.view.firm',        'hr', 'salary', 'view',   'firm',   'View all salaries'),
-- Suppliers
('suppliers.directory.view.firm',   'suppliers', 'directory', 'view',   'firm', 'View supplier directory'),
('suppliers.directory.create.firm', 'suppliers', 'directory', 'create', 'firm', 'Add supplier'),
('suppliers.wa.send.firm',          'suppliers', 'wa',        'send',   'firm', 'Send WhatsApp'),
-- AI
('ai.bill_scan.use.branch',    'ai', 'bill_scan',    'use', 'branch', 'AI bill scanner'),
('ai.voice_order.use.branch',  'ai', 'voice_order',  'use', 'branch', 'AI voice order'),
('ai.nl_search.use.firm',      'ai', 'nl_search',    'use', 'firm',   'AI smart search'),
-- Settings
('settings.user.view.firm',    'settings', 'user',  'view',   'firm', 'View users'),
('settings.user.create.firm',  'settings', 'user',  'create', 'firm', 'Invite user'),
('settings.role.view.firm',    'settings', 'role',  'view',   'firm', 'View roles'),
('settings.role.edit.firm',    'settings', 'role',  'edit',   'firm', 'Edit roles'),
('settings.branch.view.firm',  'settings', 'branch','view',   'firm', 'View branches'),
('settings.branch.create.firm','settings', 'branch','create', 'firm', 'Create branch'),
-- Wallet
('settings.wallet.view.firm',     'settings', 'wallet', 'view',     'firm', 'View wallet'),
('settings.wallet.recharge.firm', 'settings', 'wallet', 'recharge', 'firm', 'Recharge wallet'),
-- Platform (Anjaninex only)
('platform.firm.view.platform',         'platform', 'firm',    'view',     'platform', 'View all firms (Anjaninex)'),
('platform.firm.edit.platform',         'platform', 'firm',    'edit',     'platform', 'Edit firm (Anjaninex)'),
('platform.wallet.recharge.platform',   'platform', 'wallet',  'recharge', 'platform', 'Recharge any wallet (Anjaninex)'),
('platform.changelog.publish.platform', 'platform', 'changelog','publish', 'platform', 'Publish changelog (Anjaninex)'),
('platform.impersonate.platform',       'platform', 'user',    'impersonate','platform','Impersonate user (Anjaninex)');

CREATE TABLE core.roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID REFERENCES platform.firms(id) ON DELETE CASCADE,
    code            TEXT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    inherits_from   UUID REFERENCES core.roles(id),
    is_system       BOOLEAN DEFAULT FALSE,
    color           TEXT,
    sort_order      INT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (firm_id, code)
);

-- Seed system roles (firm_id NULL = available to all firms)
INSERT INTO core.roles (firm_id, code, name, is_system, color, sort_order) VALUES
(NULL, 'super_admin',    'Anjaninex Super Admin', TRUE, '#5A0E27', 0),
(NULL, 'firm_owner',     'Firm Owner',            TRUE, '#4B1E78', 1),
(NULL, 'firm_admin',     'Firm Admin',            TRUE, '#4B1E78', 2),
(NULL, 'branch_manager', 'Branch Manager',        TRUE, '#A8324B', 3),
(NULL, 'department_head','Department Head',       TRUE, '#E94B5F', 4),
(NULL, 'staff',          'Staff',                 TRUE, '#F5A623', 5),
(NULL, 'viewer',         'Viewer',                TRUE, '#9CA3AF', 6);

CREATE TABLE core.role_permissions (
    role_id         UUID NOT NULL REFERENCES core.roles(id) ON DELETE CASCADE,
    permission_id   BIGINT NOT NULL REFERENCES core.permissions(id) ON DELETE CASCADE,
    granted_by      UUID,
    granted_at      TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (role_id, permission_id)
);

-- Super Admin gets ALL permissions
INSERT INTO core.role_permissions (role_id, permission_id)
SELECT (SELECT id FROM core.roles WHERE code = 'super_admin'), id FROM core.permissions;

-- Firm Owner gets all firm-scoped (no platform.*)
INSERT INTO core.role_permissions (role_id, permission_id)
SELECT (SELECT id FROM core.roles WHERE code = 'firm_owner'), id
FROM core.permissions WHERE module != 'platform';

-- Firm Admin: same as owner minus dangerous + wallet
INSERT INTO core.role_permissions (role_id, permission_id)
SELECT (SELECT id FROM core.roles WHERE code = 'firm_admin'), id
FROM core.permissions
WHERE module != 'platform' AND code NOT IN ('settings.wallet.recharge.firm');

-- Branch Manager: branch ops + view
INSERT INTO core.role_permissions (role_id, permission_id)
SELECT (SELECT id FROM core.roles WHERE code = 'branch_manager'), id
FROM core.permissions
WHERE scope IN ('branch','self')
   OR code IN ('trading.party.view.firm','suppliers.directory.view.firm','accounting.ledger.view.firm');

-- Staff: minimal operational
INSERT INTO core.role_permissions (role_id, permission_id)
SELECT (SELECT id FROM core.roles WHERE code = 'staff'), id
FROM core.permissions
WHERE code IN (
  'trading.bill.view.branch','trading.bill.create.branch','trading.bill.edit.branch',
  'trading.payment.view.branch','trading.payment.create.branch',
  'trading.party.view.firm',
  'accounting.voucher.view.branch','accounting.voucher.create.branch',
  'hr.attendance.viewown.self','hr.leave.create.self','hr.salary.view.self',
  'suppliers.directory.view.firm',
  'ai.bill_scan.use.branch'
);

-- Viewer: only view permissions
INSERT INTO core.role_permissions (role_id, permission_id)
SELECT (SELECT id FROM core.roles WHERE code = 'viewer'), id
FROM core.permissions WHERE action = 'view';

CREATE TABLE core.user_roles (
    user_id         UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    role_id         UUID NOT NULL REFERENCES core.roles(id) ON DELETE CASCADE,
    assigned_at     TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE core.user_permission_overrides (
    user_id         UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    permission_id   BIGINT NOT NULL REFERENCES core.permissions(id) ON DELETE CASCADE,
    granted         BOOLEAN NOT NULL,
    reason          TEXT,
    expires_at      TIMESTAMPTZ,
    granted_by      UUID,
    granted_at      TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, permission_id)
);

-- =================================================
-- CONTACTS HUB (shared across modules)
-- =================================================
CREATE TABLE core.contacts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    display_name    TEXT NOT NULL,
    legal_name      TEXT,
    entity_type     TEXT NOT NULL DEFAULT 'individual',
    phone_primary   TEXT,
    phones          JSONB DEFAULT '[]',
    email_primary   TEXT,
    emails          JSONB DEFAULT '[]',
    gst_number      TEXT,
    pan_number      TEXT,
    addresses       JSONB DEFAULT '[]',
    tags            JSONB DEFAULT '[]',
    flags           JSONB DEFAULT '{}',
    source_module   TEXT,
    notes           TEXT,
    avatar_url      TEXT,
    merged_into_id  UUID REFERENCES core.contacts(id),
    created_by      UUID,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    CONSTRAINT uq_contacts_firm_gst UNIQUE (firm_id, gst_number)
);
CREATE INDEX idx_contacts_firm_name_trgm ON core.contacts USING gin (firm_id, display_name gin_trgm_ops);
CREATE INDEX idx_contacts_phone ON core.contacts(firm_id, phone_primary);
CREATE INDEX idx_contacts_active ON core.contacts(firm_id) WHERE deleted_at IS NULL;

SELECT 'Core tables created ✓' AS status;
