-- ============================================================================
-- 99: Screen & Fields ka PLATFORM DEFAULT — ek baar set karo, sab firms ko mile
-- ============================================================================
-- Sadmin kisi firm (jaise Shivi) ka poora fields-setup "default" bana deta hai.
-- Jis firm ne apni setting nahi badli, use yahi dikhega — aur NAYI firm ko
-- pehle din se. Kram: firm ki apni setting > ye default > code ki registry.

CREATE TABLE IF NOT EXISTS platform.default_field_settings (
    screen      text NOT NULL,
    field_key   text NOT NULL,
    visible     boolean,
    required    boolean,
    label       text,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  uuid,
    PRIMARY KEY (screen, field_key)
);

-- Platform-wide layout preference hai — kisi firm ka data nahi, isliye RLS nahi.
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.default_field_settings TO namokara_app;

SELECT 'default_field_settings ready ✓' AS status;
