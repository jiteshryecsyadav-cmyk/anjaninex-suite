-- ============================================================================
-- Migration 24 — WhatsApp Bot tables (Postgres)
-- Bot ek alag Node app hai jo isi PostgreSQL se baat karta hai. Ye tables bot
-- ke liye hain. Suppliers/buyers/contacts to bot existing tables se padhta hai.
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS wa;

-- Supplier ki bheji hui photo + AI-extracted rate/category.
CREATE TABLE IF NOT EXISTS wa.incoming (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID,                       -- kis firm ke bot par aayi (multi-tenant)
    from_phone      TEXT NOT NULL,              -- 10-digit normalized
    supplier_id     UUID,                       -- suppliers.supplier_profiles.id (agar match hua)
    image_hash      TEXT,                       -- dedup
    image_path      TEXT,                       -- saved file path
    caption         TEXT,
    rate            NUMERIC(12,2),
    rate_unit       TEXT,
    category_id     UUID,
    category_name   TEXT,
    confidence      NUMERIC(3,2),
    track_code      TEXT,                        -- NAM-S<id>-...
    status          TEXT DEFAULT 'processing',   -- processing|processed|failed
    model_used      TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_incoming_phone ON wa.incoming(from_phone);
CREATE INDEX IF NOT EXISTS idx_wa_incoming_created ON wa.incoming(created_at);

-- Chat state machine (onboarding / buyer-search) per phone.
CREATE TABLE IF NOT EXISTS wa.conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone           TEXT NOT NULL UNIQUE,        -- 10-digit normalized
    state           TEXT DEFAULT 'IDLE',
    context         JSONB DEFAULT '{}',
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Q&A log (buyer/supplier questions answered by Claude).
CREATE TABLE IF NOT EXISTS wa.qa_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone           TEXT,
    question        TEXT,
    answer          TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Forward log — kaunsi photo kis buyer ko bheji + reply.
CREATE TABLE IF NOT EXISTS wa.forwards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incoming_id     UUID REFERENCES wa.incoming(id) ON DELETE CASCADE,
    to_phone        TEXT NOT NULL,
    buyer_id        UUID,
    track_code      TEXT,
    reply_text      TEXT,
    sent_at         TIMESTAMPTZ DEFAULT now(),
    replied_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wa_forwards_buyer ON wa.forwards(to_phone);

COMMIT;

SELECT 'migration 24-whatsapp-bot complete' AS status;
