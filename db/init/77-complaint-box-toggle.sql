-- 77: Complaint Box ka per-firm toggle (CREDIL pattern)
-- DEFAULT TRUE — har firm ke liye on rahta hai; sadmin chahe to kisi firm ka band kar sake.

ALTER TABLE platform.firms
    ADD COLUMN IF NOT EXISTS complaint_box_enabled boolean NOT NULL DEFAULT true;
