-- ============================================================================
-- 107: Party Chat PERSONAL INVITE LINKS — har party ka apna code
-- ============================================================================
-- Link: /pchat/<firmId>?i=CODE — ye link SIRF usi party ke number se khulta hai.
-- Koi aur apna number daale to rok: "Ye link <party> ke liye hai".
-- (Suraksha pehle bhi OTP se thi — ye upar ka pehra + personal touch hai.)

CREATE TABLE IF NOT EXISTS platform.party_chat_invites (
    code         TEXT PRIMARY KEY,           -- 8-char (jaise K7M2X9QD)
    firm_id      UUID NOT NULL,
    party_id     UUID NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pchat_invites_firm_party
    ON platform.party_chat_invites(firm_id, party_id);

SELECT 'pchat invites ready ✓' AS status;
