-- ============================================================================
-- Namokara Suite — Subscription Lifecycle (Trial + Renewal + Auto-Suspend)
-- Defaults: 15-day trial · 7/3/1-day notifications · 3-day grace · manual renewal
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Add lifecycle columns to platform.firms
-- ----------------------------------------------------------------------------
ALTER TABLE platform.firms
  ADD COLUMN IF NOT EXISTS trial_started_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_ends_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grace_until           TIMESTAMPTZ,        -- 3 days after expiry
  ADD COLUMN IF NOT EXISTS notif_7d_sent_at      TIMESTAMPTZ,        -- 7-day reminder timestamp
  ADD COLUMN IF NOT EXISTS notif_3d_sent_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notif_1d_sent_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notif_expired_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason      TEXT,               -- 'trial_expired' | 'subscription_expired' | 'manual_admin' | 'fraud'
  ADD COLUMN IF NOT EXISTS reactivated_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_extended_count  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_extended_by      UUID;

-- Status check constraint update (add 'grace_period')
ALTER TABLE platform.firms DROP CONSTRAINT IF EXISTS firms_status_chk;
ALTER TABLE platform.firms ADD CONSTRAINT firms_status_chk CHECK (
  status IN ('trial','active','grace_period','suspended','cancelled','low_wallet')
);

-- ----------------------------------------------------------------------------
-- Indexes for the daily cron-style query
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_firms_trial_ends_at
  ON platform.firms (trial_ends_at)
  WHERE status = 'trial';

CREATE INDEX IF NOT EXISTS idx_firms_subscription_ends_at
  ON platform.firms (subscription_ends_at)
  WHERE status IN ('active','grace_period');

CREATE INDEX IF NOT EXISTS idx_firms_status_grace_until
  ON platform.firms (status, grace_until)
  WHERE status = 'grace_period';

-- ----------------------------------------------------------------------------
-- Notifications table (in-app inbox)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
  user_id       UUID,                                                 -- NULL = all firm users
  type          TEXT NOT NULL,    -- 'trial_warn_7d' | 'trial_warn_3d' | 'trial_warn_1d'
                                  -- | 'trial_expired' | 'subscription_warn_7d' | 'subscription_expired'
                                  -- | 'wallet_low' | 'recharge_success' | 'admin_announcement'
  severity      TEXT NOT NULL CHECK (severity IN ('info','warning','urgent','critical')),
  title         TEXT NOT NULL,
  body          TEXT,
  cta_label     TEXT,             -- e.g., "Subscribe Now", "Recharge Wallet"
  cta_url       TEXT,             -- e.g., "/wallet", "/admin/firms/123"
  channels_sent JSONB DEFAULT '{}'::jsonb,  -- {"inapp":true,"email":true,"sms":false}
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notif_firm_unread ON platform.notifications (firm_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notif_firm_created ON platform.notifications (firm_id, created_at DESC);

ALTER TABLE platform.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notif_firm_iso ON platform.notifications
  USING (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (firm_id = core.current_firm_id() OR current_setting('app.is_platform_admin', true) = 'true');

-- ----------------------------------------------------------------------------
-- Trial extension audit (separate from generic admin_actions for clarity)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.trial_extensions (
  id            BIGSERIAL PRIMARY KEY,
  firm_id       UUID NOT NULL REFERENCES platform.firms(id),
  extended_by   UUID NOT NULL,        -- platform admin user id
  days_added    INTEGER NOT NULL,
  reason        TEXT,
  previous_ends_at TIMESTAMPTZ,
  new_ends_at   TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trial_ext_firm ON platform.trial_extensions (firm_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- Trigger: on firm INSERT (new signup) → start 15-day trial automatically
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.start_trial_on_signup()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS NULL OR NEW.status = 'trial' THEN
    NEW.status              := 'trial';
    NEW.trial_started_at    := COALESCE(NEW.trial_started_at, now());
    NEW.trial_ends_at       := COALESCE(NEW.trial_ends_at, NEW.trial_started_at + INTERVAL '15 days');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_firms_start_trial ON platform.firms;
CREATE TRIGGER trg_firms_start_trial
  BEFORE INSERT ON platform.firms
  FOR EACH ROW
  EXECUTE FUNCTION platform.start_trial_on_signup();

-- ----------------------------------------------------------------------------
-- Back-fill existing firms (one-time)
-- ----------------------------------------------------------------------------
UPDATE platform.firms
SET trial_started_at = activated_at,
    trial_ends_at    = activated_at + INTERVAL '15 days'
WHERE status = 'trial' AND trial_started_at IS NULL;

UPDATE platform.firms
SET subscription_started_at = COALESCE(subscription_started_at, activated_at),
    subscription_ends_at    = COALESCE(subscription_ends_at, activated_at + INTERVAL '30 days')
WHERE status = 'active' AND subscription_ends_at IS NULL;

-- Demo: mark the seeded firm as 'active' (it pays Enterprise)
UPDATE platform.firms
SET status = 'active',
    subscription_started_at = now() - INTERVAL '5 days',
    subscription_ends_at    = now() + INTERVAL '25 days'
WHERE name LIKE 'Namokara Agencies%';

-- Insert a demo TRIAL firm (so we can see banner / lockout in action)
INSERT INTO platform.firms (
  id, name, legal_name, gst_number, pan_number, industry, city, state,
  contact_email, contact_phone, plan_id, wallet_balance, status,
  activated_at, trial_started_at, trial_ends_at
) VALUES (
  'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
  'Demo Trial Firm', 'Demo Trial Firm Pvt Ltd',
  '07ABCDE1111A1Z5', 'ABCDE1111A', 'Trading',
  'Mumbai', 'MH', 'trial@demo.com', '+919999999999',
  (SELECT id FROM platform.subscription_plans WHERE code = 'starter' LIMIT 1),
  150,
  'trial',
  now() - INTERVAL '10 days',                -- 10 days ago
  now() - INTERVAL '10 days',
  now() + INTERVAL '5 days'                  -- 5 days remaining → triggers 7-day warning
) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- View: firms_lifecycle (for admin dashboard)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW platform.firms_lifecycle AS
SELECT
  f.id, f.name, f.status,
  f.trial_ends_at,
  f.subscription_ends_at,
  f.grace_until,
  f.wallet_balance,
  CASE
    WHEN f.status = 'trial' THEN GREATEST(0, EXTRACT(EPOCH FROM (f.trial_ends_at - now())) / 86400)::INT
    WHEN f.status IN ('active','grace_period') THEN GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(f.grace_until, f.subscription_ends_at) - now())) / 86400)::INT
    ELSE 0
  END AS days_left,
  CASE
    WHEN f.status = 'suspended' THEN '🔴'
    WHEN f.status = 'grace_period' THEN '🟠'
    WHEN f.status = 'trial' AND f.trial_ends_at < now() + INTERVAL '1 day' THEN '🔴'
    WHEN f.status = 'trial' AND f.trial_ends_at < now() + INTERVAL '3 days' THEN '🟠'
    WHEN f.status = 'trial' AND f.trial_ends_at < now() + INTERVAL '7 days' THEN '🟡'
    WHEN f.status = 'active' AND f.subscription_ends_at < now() + INTERVAL '3 days' THEN '🟡'
    ELSE '🟢'
  END AS health
FROM platform.firms f
ORDER BY f.created_at DESC;

GRANT SELECT ON platform.firms_lifecycle TO namokara_app;
GRANT SELECT, INSERT, UPDATE ON platform.notifications TO namokara_app;
GRANT USAGE ON SEQUENCE platform.trial_extensions_id_seq TO namokara_app;
GRANT SELECT, INSERT ON platform.trial_extensions TO namokara_app;

SELECT 'Subscription lifecycle schema applied ✓' AS status;
