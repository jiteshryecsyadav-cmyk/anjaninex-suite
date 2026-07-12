-- 73: Complaint Box — firm user -> Anjaninex super-admin chat (WhatsApp-style read receipts).
-- User sidebar se complaint bhejta hai; Anjaninex sadmin panel me dekhta/reply karta hai.
-- read_at NULL = unread (grey ✓✓), set = padh liya (blue ✓✓ — WhatsApp jaisa).
-- RLS NAHI (Credil pattern): platform-managed dataset; controllers firm_id filter +
-- admin endpoints platform permission se guarded hain.

-- Complaint thread (ek subject = ek chat).
CREATE TABLE IF NOT EXISTS platform.complaints (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id          uuid NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    created_by       uuid,                     -- core.users id
    created_by_name  text,                     -- snapshot (user delete ho jaye to bhi naam dikhe)
    subject          text NOT NULL,
    status           text NOT NULL DEFAULT 'open',   -- open | resolved
    created_at       timestamptz DEFAULT now(),
    last_msg_at      timestamptz DEFAULT now()       -- sorting ke liye (latest chat upar)
);
CREATE INDEX IF NOT EXISTS idx_complaints_firm   ON platform.complaints(firm_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON platform.complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_lastmsg ON platform.complaints(last_msg_at DESC);

-- Chat messages (dono taraf: user + admin). Photo optional.
CREATE TABLE IF NOT EXISTS platform.complaint_messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id    uuid NOT NULL REFERENCES platform.complaints(id) ON DELETE CASCADE,
    sender          text NOT NULL CHECK (sender IN ('user','admin')),
    sender_user_id  uuid,
    sender_name     text,
    body            text,
    photo_url       text,                      -- /api/complaints/photo/<file> (optional attachment)
    created_at      timestamptz DEFAULT now(),
    read_at         timestamptz                -- NULL = unread; set hote hi bhejne wale ko blue tick
);
CREATE INDEX IF NOT EXISTS idx_complaint_msgs_thread ON platform.complaint_messages(complaint_id, created_at);
-- Unread count queries (admin queue + user badge) fast rahe.
CREATE INDEX IF NOT EXISTS idx_complaint_msgs_unread ON platform.complaint_messages(complaint_id) WHERE read_at IS NULL;
