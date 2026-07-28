-- ============================================================================
-- 106: PARTY PORTAL — ek number, SAARI agencies ki chats (WhatsApp-ghar jaisa)
-- ============================================================================
-- Supplier/buyer sirf ek agency se kaam nahi karta. Ab /pchat (bina firm) par
-- number+OTP se login → jitni bhi firms me uska number Party Master me hai,
-- sabki chat-list dikhti hai (unread ke saath) → tap = us firm ki chat.
-- Purane per-firm links (/pchat/<firmId>) waise hi chalte rahenge.

CREATE TABLE IF NOT EXISTS platform.party_portal_otps (
    phone       TEXT PRIMARY KEY,          -- 10-digit normalized
    otp_hash    TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    attempts    INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.party_portal_sessions (
    token       TEXT PRIMARY KEY,
    phone       TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_party_portal_sessions_phone ON platform.party_portal_sessions(phone);

SELECT 'party portal ready ✓' AS status;
