-- 80: WhatsApp jaisa message delete
-- "Delete for everyone" = row hi delete (dono taraf se gayab)
-- "Delete for me"       = sirf apni taraf chhupa do (flag)

ALTER TABLE platform.party_chat_messages
    ADD COLUMN IF NOT EXISTS deleted_for_firm  boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS deleted_for_party boolean NOT NULL DEFAULT false;
