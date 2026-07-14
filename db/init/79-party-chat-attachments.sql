-- 79: Party Chat attachments — photo/document bhejne ke liye (WhatsApp jaisa + menu)

ALTER TABLE platform.party_chat_messages
    ADD COLUMN IF NOT EXISTS attachment_url  text,
    ADD COLUMN IF NOT EXISTS attachment_name text,
    ADD COLUMN IF NOT EXISTS attachment_type text;   -- image | document
