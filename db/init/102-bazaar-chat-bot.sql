-- ============================================================================
-- 102: Bazaar Bot ab PARTY CHAT ke andar — photo → watermark → buyers broadcast
-- ============================================================================
-- WhatsApp QR-bot ka poora flow (supplier photo → rate → watermark → matching
-- buyers ko bhejo → ORDER <code> se order) ab Party Chat me chalta hai.
-- Wahi wa.* tables reuse hoti hain (incoming/forwards/orders) — source = 'pchat'.

-- Bot ki baat-cheet ka state (rate poochha hai? order confirm ho raha hai?)
-- per-thread — thread pehle se (firm, party) unique hai.
CREATE TABLE IF NOT EXISTS platform.party_chat_bot_state (
    thread_id   UUID PRIMARY KEY REFERENCES platform.party_chat_threads(id) ON DELETE CASCADE,
    state       TEXT NOT NULL DEFAULT 'IDLE',
    context     JSONB NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS nahi (Party Chat pattern) — access hamesha thread_id se hota hai jo already firm-scoped hai.

-- Kahan se aayi photo/order — purana WhatsApp bot ya naya Party Chat bot
ALTER TABLE wa.incoming ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'wa';   -- wa | pchat
ALTER TABLE wa.orders   ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'wa';

-- Order code ab sequence se (COUNT+1 race-prone tha) — gap chale ga, ye bot-order hai
CREATE SEQUENCE IF NOT EXISTS wa.order_code_seq;
SELECT setval('wa.order_code_seq',
    GREATEST((SELECT last_value FROM wa.order_code_seq),
             COALESCE((SELECT MAX(NULLIF(regexp_replace(order_code, '\D', '', 'g'), '')::bigint)
                         FROM wa.orders), 0) + 1),
    false);

-- Feature flag — sab ke liye ON; bot waise bhi sirf tab bolta hai jab bhejne
-- wala us firm ke Bazaar Link supplier/buyer profile se match kare.
INSERT INTO platform.feature_flags (key, name, description, enabled_all)
VALUES ('bazaar_chat_bot', 'Bazaar Link: Party Chat Bot',
        'Supplier Party Chat me photo bheje → watermark lagkar matching buyers ko jaye, ORDER <code> se order bane.',
        true)
ON CONFLICT (key) DO NOTHING;

SELECT 'bazaar chat bot ready ✓' AS status;
