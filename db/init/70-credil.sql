-- 70: CREDIL — Payment & Trust Index (network score card). Phase 1 schema.
-- Access app-layer se control hoti hai (controllers firm_id filter + platform permission).
-- Isliye credil.* pe RLS enable NAHI kiya (network dataset, platform-managed).

CREATE SCHEMA IF NOT EXISTS credil;

-- Party identity by GST (cross-firm unique). Registered mobile OTP-consent ke liye.
CREATE TABLE IF NOT EXISTS credil.party_identity (
    gst                text PRIMARY KEY,
    pan                text,
    display_name       text,
    entity_type        text,                 -- buyer | supplier | agency | both
    registered_mobile  text,
    mobile_verified    boolean DEFAULT false,
    group_id           uuid,
    created_at         timestamptz DEFAULT now(),
    updated_at         timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credil_party_pan ON credil.party_identity(pan);

-- Company groups (sister firms — ek owner ki multiple firms).
CREATE TABLE IF NOT EXISTS credil.groups (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text,
    owner_name  text,
    created_by  uuid,
    created_at  timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS credil.group_members (
    group_id    uuid REFERENCES credil.groups(id) ON DELETE CASCADE,
    gst         text,
    PRIMARY KEY (group_id, gst)
);

-- Score events — har relevant behaviour signal (raw). firm_id internal rehta hai (report me expose nahi).
CREATE TABLE IF NOT EXISTS credil.score_events (
    id          bigserial PRIMARY KEY,
    party_gst   text NOT NULL,
    firm_id     uuid,
    entity_type text,                          -- buyer | supplier | agency
    event_type  text NOT NULL,                 -- payment_ontime, payment_late, cheque_bounce, gr_return,
                                               -- delivery_late, rate_dispute, bill_pending_12m, commission_dormant_12m, volume, ...
    sub_score   text,                          -- pay|default|trade|delivery|quality|integrity|volume|portfolio
    weight      numeric(8,2) DEFAULT 0,        -- signed contribution
    amount      numeric(14,2),
    ref_id      uuid,
    event_date  date DEFAULT current_date,
    created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credil_events_gst ON credil.score_events(party_gst);
CREATE INDEX IF NOT EXISTS idx_credil_events_type ON credil.score_events(event_type);

-- Computed scores (cache). Report inhi se banti hai.
CREATE TABLE IF NOT EXISTS credil.scores (
    party_gst        text PRIMARY KEY,
    entity_type      text,
    total_score      int,                      -- 300-900
    pay_score        int,
    default_score    int,
    trade_score      int,
    delivery_score   int,
    quality_score    int,
    integrity_score  int,
    volume_score     int,
    portfolio_score  int,
    red_flags        jsonb DEFAULT '[]'::jsonb,
    narrative        text,                     -- AI-generated summary (optional)
    data_points      int DEFAULT 0,            -- insufficient-data threshold ke liye
    firms_count      int DEFAULT 0,
    computed_at      timestamptz DEFAULT now()
);

-- Report requests + consent + payment + admin approval.
CREATE TABLE IF NOT EXISTS credil.report_requests (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requesting_firm_id uuid NOT NULL,
    requested_by       uuid,
    target_gst         text,                   -- single party
    target_group_id    uuid,                   -- ya group
    components         jsonb DEFAULT '[]'::jsonb,   -- ["pay","default","trade","delivery","quality","volume"]
    otp_hash           text,
    otp_sent_to        text,                   -- masked mobile (e.g. 9xxxxx1234)
    otp_verified       boolean DEFAULT false,
    otp_expires_at     timestamptz,
    amount             numeric(10,2) DEFAULT 0,
    payment_ref        text,
    paid               boolean DEFAULT false,
    status             text DEFAULT 'pending', -- pending|otp_ok|paid|approved|rejected|delivered
    review_note        text,
    reviewed_by        uuid,
    reviewed_at        timestamptz,
    pdf_url            text,
    created_at         timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credil_req_firm ON credil.report_requests(requesting_firm_id);
CREATE INDEX IF NOT EXISTS idx_credil_req_status ON credil.report_requests(status);

-- Single-row config: rate card + weights + thresholds (Anjaninex admin editable).
CREATE TABLE IF NOT EXISTS credil.config (
    id                   int PRIMARY KEY DEFAULT 1,
    full_report_price    numeric(10,2) DEFAULT 500,
    per_component_price  numeric(10,2) DEFAULT 150,
    min_firms            int DEFAULT 2,         -- insufficient-data: itni firms ka data zaroori
    min_data_points      int DEFAULT 5,
    weights              jsonb DEFAULT '{}'::jsonb,
    updated_at           timestamptz DEFAULT now(),
    CONSTRAINT credil_config_single CHECK (id = 1)
);
INSERT INTO credil.config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Per-firm feature toggle (Anjaninex admin ON/OFF).
ALTER TABLE platform.firms ADD COLUMN IF NOT EXISTS credil_enabled boolean DEFAULT false;
