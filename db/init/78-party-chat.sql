-- 78: PARTY CHAT — firm ↔ uski party (buyer/supplier) ke beech WhatsApp-jaisi chat.
-- Party ke paas login nahi hota: mobile number + OTP se verify hoke chat kholti hai.
-- RLS nahi (Complaint Box/Credil pattern) — har query app-layer par firm_id/token se filter hoti hai.

CREATE TABLE IF NOT EXISTS platform.party_chat_threads (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id       uuid NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    party_id      uuid NOT NULL,              -- trading.party_profiles.id
    party_name    text NOT NULL,
    phone         text NOT NULL,              -- party ka verified mobile (digits only)
    status        text NOT NULL DEFAULT 'open',
    last_msg_at   timestamptz NOT NULL DEFAULT now(),
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (firm_id, party_id)
);

CREATE TABLE IF NOT EXISTS platform.party_chat_messages (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id   uuid NOT NULL REFERENCES platform.party_chat_threads(id) ON DELETE CASCADE,
    sender      text NOT NULL CHECK (sender IN ('firm','party')),
    sender_name text,
    body        text NOT NULL,
    read_at     timestamptz,                 -- NULL = unread → read hote hi blue tick
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pchat_msgs_thread ON platform.party_chat_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pchat_msgs_unread ON platform.party_chat_messages(thread_id) WHERE read_at IS NULL;

-- OTP: phone+firm par 6-digit, 10 min expiry, max 5 attempts
CREATE TABLE IF NOT EXISTS platform.party_chat_otps (
    firm_id     uuid NOT NULL,
    phone       text NOT NULL,
    otp_hash    text NOT NULL,
    expires_at  timestamptz NOT NULL,
    attempts    int NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (firm_id, phone)
);

-- Verify hone par party ko token milta hai (7 din) — har public call isi se
CREATE TABLE IF NOT EXISTS platform.party_chat_sessions (
    token       text PRIMARY KEY,
    thread_id   uuid NOT NULL REFERENCES platform.party_chat_threads(id) ON DELETE CASCADE,
    expires_at  timestamptz NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON
    platform.party_chat_threads, platform.party_chat_messages,
    platform.party_chat_otps, platform.party_chat_sessions
TO namokara_app;

-- Feature flag: pilot pehle Riddhi Agency me
INSERT INTO platform.feature_flags (key, name, description)
VALUES ('party_chat', 'Party Chat', 'Firm ↔ party (buyer/supplier) chat — party mobile OTP se verify hoke baat karti hai')
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform.feature_flag_firms (flag_key, firm_id)
SELECT 'party_chat', f.id FROM platform.firms f WHERE lower(f.name) LIKE '%riddhi%'
ON CONFLICT DO NOTHING;
