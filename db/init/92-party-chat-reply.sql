-- 92: PARTY CHAT — WhatsApp jaisa REPLY (kisi message ko quote karke jawab).
-- Pehle sirf seedha message ja sakta tha. Lambi baat-cheet me pata hi nahi
-- chalta tha ki jawab KIS baat ka hai.
--
-- ON DELETE SET NULL jaan-boojh kar: jis message ka jawab diya tha wo delete ho
-- jaye to jawab GAYAB nahi hona chahiye — bas uska quote hat jayega.

ALTER TABLE platform.party_chat_messages
    ADD COLUMN IF NOT EXISTS reply_to_id uuid
        REFERENCES platform.party_chat_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pchat_msg_reply
    ON platform.party_chat_messages(reply_to_id)
    WHERE reply_to_id IS NOT NULL;

SELECT 'party chat reply ✓' AS status;
