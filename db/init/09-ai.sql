-- ============================================================================
-- Namokara Suite — AI Module Tables
-- Audit log of all AI extractions + image hash cache
-- ============================================================================

-- =================================================
-- 1. EXTRACTION LOGS (audit trail + ML feedback)
-- =================================================
CREATE TABLE ai.extraction_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    agent_name      TEXT NOT NULL,                -- bill_extractor|cheque_reader|gr_scanner|...
    model_used      TEXT,                          -- gemini-2.5-flash|google-document-ai|mock
    image_hash      TEXT,                          -- SHA-256 for dedupe cache
    input_size_kb   INT,
    input_url       TEXT,                          -- where the image is stored
    output_json     JSONB,                          -- full extracted structured data
    confidence      NUMERIC(3,2),
    latency_ms      INT,
    cost_inr        NUMERIC(8,4),                  -- amount debited from wallet
    user_corrected  BOOLEAN DEFAULT FALSE,
    correction_diff JSONB,                          -- what user changed → ML training
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_ai_logs_firm_time ON ai.extraction_logs(firm_id, created_at DESC);
CREATE INDEX idx_ai_logs_hash ON ai.extraction_logs(image_hash) WHERE image_hash IS NOT NULL;
CREATE INDEX idx_ai_logs_agent ON ai.extraction_logs(agent_name, created_at DESC);

-- =================================================
-- 2. CACHE (hash-based dedupe — 24hr TTL)
-- =================================================
CREATE TABLE ai.cache (
    cache_key       TEXT PRIMARY KEY,
    firm_id         UUID NOT NULL,
    agent_name      TEXT NOT NULL,
    payload         JSONB NOT NULL,
    cost_saved      NUMERIC(8,4),
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_ai_cache_expires ON ai.cache(expires_at);

-- =================================================
-- RLS
-- =================================================
ALTER TABLE ai.extraction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.cache           ENABLE ROW LEVEL SECURITY;

CREATE POLICY firm_isolation_ai_logs  ON ai.extraction_logs USING (firm_id = current_firm_id());
CREATE POLICY firm_isolation_ai_cache ON ai.cache            USING (firm_id = current_firm_id());

SELECT 'AI tables created ✓' AS status;
