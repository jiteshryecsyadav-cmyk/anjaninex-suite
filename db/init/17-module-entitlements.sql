-- ============================================================================
-- Namokara Suite — Module Entitlements & Pricing Plans
-- 4 tier plans + per-firm module toggles + AI quota tracking
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Per-firm entitlement columns on platform.firms
-- ----------------------------------------------------------------------------
ALTER TABLE platform.firms
  ADD COLUMN IF NOT EXISTS enabled_modules    JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS plan_code          TEXT,
  ADD COLUMN IF NOT EXISTS ai_quota_monthly   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_used_this_month INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS user_limit         INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS branch_limit       INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ai_quota_reset_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_firms_plan_code ON platform.firms(plan_code);
CREATE INDEX IF NOT EXISTS idx_firms_enabled_modules_gin ON platform.firms USING gin(enabled_modules);

-- ----------------------------------------------------------------------------
-- 2. Ensure subscription_plans table exists (created earlier but make idempotent)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.subscription_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  monthly_inr     NUMERIC(10,2),
  annual_inr      NUMERIC(10,2),
  max_branches    INTEGER NOT NULL DEFAULT 1,
  max_users       INTEGER NOT NULL DEFAULT 3,
  max_ai_calls    INTEGER NOT NULL DEFAULT 0,
  max_wa_messages INTEGER NOT NULL DEFAULT 0,
  features        JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. Seed 4 plan templates
-- ----------------------------------------------------------------------------
-- Module flags (keys used everywhere):
--   trading             — Orders + Bills + Payments + Party Master
--   accounting          — Vouchers + Ledgers + Sub-groups
--   reports_core        — 5 core reports (Sales Register, Outstanding, Aging, GST, Pending Orders)
--   reports_advanced    — 8 advanced reports (Top Parties, Top Items, GR, Commission, On-Time, Order-vs-Bill, Party Wise, etc.)
--   ai_scan             — AI bill/order scan
--   active_directory    — Supplier Directory + Categories + Photos
--   commission          — Commission e-Invoices module
--   hr                  — HR (Staff, Attendance, Selfie, Live Location, Leave, Payroll)
--   wallet              — Wallet recharge + auto-debit
--   white_label         — Customer's own logo / colors
--   api_access          — Public API access for integrations
--   priority_support    — Priority WhatsApp/phone support
--
-- Insert plans (idempotent via ON CONFLICT)

INSERT INTO platform.subscription_plans
  (code, name, monthly_inr, annual_inr, max_branches, max_users, max_ai_calls, max_wa_messages, features, is_active, sort_order)
VALUES
  ('starter', '🥉 Starter', 999, 9999, 1, 3, 0, 100,
   '{"trading":true,"accounting":true,"reports_core":true,"reports_advanced":false,"ai_scan":false,"active_directory":false,"commission":false,"hr":false,"wallet":true,"white_label":false,"api_access":false,"priority_support":false}'::jsonb,
   TRUE, 10),

  ('growth', '🥈 Growth', 2499, 24999, 3, 10, 100, 500,
   '{"trading":true,"accounting":true,"reports_core":true,"reports_advanced":true,"ai_scan":true,"active_directory":true,"commission":true,"hr":false,"wallet":true,"white_label":false,"api_access":false,"priority_support":false}'::jsonb,
   TRUE, 20),

  ('business', '🥇 Business', 4999, 49999, 999, 999, 999999, 2000,
   '{"trading":true,"accounting":true,"reports_core":true,"reports_advanced":true,"ai_scan":true,"active_directory":true,"commission":true,"hr":true,"wallet":true,"white_label":false,"api_access":false,"priority_support":true}'::jsonb,
   TRUE, 30),

  ('enterprise', '💎 Enterprise', 9999, 99999, 999, 9999, 999999, 10000,
   '{"trading":true,"accounting":true,"reports_core":true,"reports_advanced":true,"ai_scan":true,"active_directory":true,"commission":true,"hr":true,"wallet":true,"white_label":true,"api_access":true,"priority_support":true}'::jsonb,
   TRUE, 40)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  monthly_inr = EXCLUDED.monthly_inr,
  annual_inr = EXCLUDED.annual_inr,
  max_branches = EXCLUDED.max_branches,
  max_users = EXCLUDED.max_users,
  max_ai_calls = EXCLUDED.max_ai_calls,
  max_wa_messages = EXCLUDED.max_wa_messages,
  features = EXCLUDED.features,
  is_active = TRUE;

-- ----------------------------------------------------------------------------
-- 4. Auto-assign growth plan to all existing firms that don't have one
--    (so dev/test data keeps working)
-- ----------------------------------------------------------------------------
UPDATE platform.firms f
SET
  plan_code = 'growth',
  enabled_modules = (SELECT features FROM platform.subscription_plans WHERE code = 'growth'),
  ai_quota_monthly = 100,
  user_limit = 10,
  branch_limit = 3
WHERE plan_code IS NULL OR plan_code = '';

-- ----------------------------------------------------------------------------
-- 5. Helper view — quick join firm + plan for admin queries
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW platform.firm_subscription_view AS
SELECT
  f.id                AS firm_id,
  f.name              AS firm_name,
  f.status            AS firm_status,
  f.plan_code,
  p.name              AS plan_name,
  p.monthly_inr,
  f.enabled_modules,
  f.ai_quota_monthly,
  f.ai_used_this_month,
  f.user_limit,
  f.branch_limit,
  f.wallet_balance,
  f.trial_ends_at,
  f.subscription_ends_at
FROM platform.firms f
LEFT JOIN platform.subscription_plans p ON p.code = f.plan_code;

SELECT 'module-entitlements migration complete ✓' AS status;
