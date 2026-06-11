-- ============================================================================
-- Namokara Suite — Platform Tables (Anjaninex SaaS master)
-- ============================================================================

-- Subscription plans
CREATE TABLE platform.subscription_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    monthly_inr     NUMERIC(10,2),
    annual_inr      NUMERIC(10,2),
    max_branches    INT NOT NULL DEFAULT 1,
    max_users       INT NOT NULL DEFAULT 5,
    max_ai_calls    INT NOT NULL DEFAULT 100,
    max_wa_messages INT NOT NULL DEFAULT 100,
    features        JSONB NOT NULL DEFAULT '{}',
    is_active       BOOLEAN DEFAULT TRUE,
    sort_order      INT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

INSERT INTO platform.subscription_plans (code, name, monthly_inr, annual_inr, max_branches, max_users, max_ai_calls, max_wa_messages, features, sort_order) VALUES
('trial',      'Free Trial',  0,     0,      1,  3,    50,     50,    '{"reports":true,"ai":false,"wallet":true}',          0),
('starter',    'Starter',     999,   9999,   1,  10,   500,    500,   '{"reports":true,"ai":false,"wallet":true}',          1),
('pro',        'Pro',         2499,  24999,  5,  50,   5000,   5000,  '{"reports":true,"ai":true,"wallet":true,"wa":true}', 2),
('enterprise', 'Enterprise',  6999,  69999,  50, 500,  50000,  50000, '{"reports":true,"ai":true,"wallet":true,"wa":true,"custom_roles":true,"api_access":true}', 3);

-- Firms (tenants)
CREATE TABLE platform.firms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    legal_name      TEXT,
    gst_number      TEXT UNIQUE,
    pan_number      TEXT,
    industry        TEXT,
    city            TEXT,
    state           TEXT,
    contact_email   TEXT NOT NULL,
    contact_phone   TEXT NOT NULL,
    plan_id         UUID REFERENCES platform.subscription_plans(id),
    wallet_balance  NUMERIC(14,2) NOT NULL DEFAULT 0,
    credit_limit    NUMERIC(14,2) NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'trial',
    trial_ends_at   TIMESTAMPTZ,
    activated_at    TIMESTAMPTZ,
    subscription_started_at TIMESTAMPTZ,
    subscription_ends_at    TIMESTAMPTZ,
    logo_url        TEXT,
    timezone        TEXT DEFAULT 'Asia/Kolkata',
    locale          TEXT DEFAULT 'en-IN',
    currency        TEXT DEFAULT 'INR',
    meta            JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_firms_status ON platform.firms(status);
CREATE INDEX idx_firms_plan ON platform.firms(plan_id);

-- Wallet ledger
CREATE TABLE platform.wallet_ledger (
    id              BIGSERIAL PRIMARY KEY,
    firm_id         UUID NOT NULL REFERENCES platform.firms(id),
    txn_type        TEXT NOT NULL,
    amount          NUMERIC(14,2) NOT NULL,
    balance_after   NUMERIC(14,2) NOT NULL,
    reference_id    TEXT,
    description     TEXT,
    created_by      UUID,
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_wallet_ledger_firm_time ON platform.wallet_ledger(firm_id, created_at DESC);

-- Platform revenue tracking
CREATE TABLE platform.platform_revenue (
    id              BIGSERIAL PRIMARY KEY,
    source_firm_id  UUID REFERENCES platform.firms(id),
    source_type     TEXT NOT NULL,
    gross_inr       NUMERIC(14,2) NOT NULL,
    cost_inr        NUMERIC(14,2) NOT NULL DEFAULT 0,
    margin_inr      NUMERIC(14,2) GENERATED ALWAYS AS (gross_inr - cost_inr) STORED,
    description     TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_platform_revenue_time ON platform.platform_revenue(created_at DESC);

-- Changelog (version history shown to users)
CREATE TABLE platform.changelog (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version         TEXT UNIQUE NOT NULL,
    release_date    DATE NOT NULL,
    new_features    JSONB DEFAULT '[]',
    improvements    JSONB DEFAULT '[]',
    fixes           JSONB DEFAULT '[]',
    breaking_changes JSONB DEFAULT '[]',
    requires_force_update BOOLEAN DEFAULT FALSE,
    published_by    UUID,
    published_at    TIMESTAMPTZ DEFAULT now()
);

-- Insert version 1.0.0
INSERT INTO platform.changelog (version, release_date, new_features, requires_force_update) VALUES
('1.0.0', CURRENT_DATE,
 '["Multi-tenant SaaS launched","Trading + Accounting modules","Login + RBAC + Branches","PWA install support","Wallet system","Powered by Anjaninex"]'::jsonb,
 FALSE);

-- Auto-recharge rules
CREATE TABLE platform.auto_recharge_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID UNIQUE NOT NULL REFERENCES platform.firms(id),
    enabled         BOOLEAN DEFAULT FALSE,
    trigger_balance NUMERIC(10,2) DEFAULT 500,
    recharge_amount NUMERIC(10,2) DEFAULT 1000,
    payment_method_token TEXT,
    last_recharge_at TIMESTAMPTZ,
    monthly_limit   NUMERIC(10,2) DEFAULT 10000
);

SELECT 'Platform tables created ✓' AS status;
