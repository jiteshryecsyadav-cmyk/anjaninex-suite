-- 72: CREDIL report request — approve ke time score ka immutable snapshot + app-role grants.

-- (a) Snapshot column: bina snapshot ke baad me score badle to purchased report bhi badal jaati.
ALTER TABLE credil.report_requests ADD COLUMN IF NOT EXISTS report_json  jsonb;
ALTER TABLE credil.report_requests ADD COLUMN IF NOT EXISTS otp_attempts int DEFAULT 0;

-- (b) App role (namokara_app) ko credil.* pe privileges do. credil.* pe RLS nahi hai,
--     par app is role se connect karta hai to table-level GRANT zaroori hai warna 42501.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'namokara_app') THEN
    GRANT USAGE ON SCHEMA credil TO namokara_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA credil TO namokara_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA credil TO namokara_app;
    GRANT EXECUTE ON FUNCTION credil.refresh_scores() TO namokara_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA credil
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO namokara_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA credil
      GRANT USAGE, SELECT ON SEQUENCES TO namokara_app;
  END IF;
END $$;
