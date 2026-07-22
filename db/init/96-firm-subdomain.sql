-- ============================================================================
-- 96: Firm subdomain — riddhi.vyaparsetu.anjaninex.com jaisa apna pata
-- ============================================================================
-- Sadmin firm ke record me subdomain likhta hai (sirf a-z, 0-9, hyphen).
-- Wildcard DNS + nginx pehle se sab subdomains ko isi app par laate hain;
-- app Host header se firm pehchan kar login page par uska naam/theme dikhati
-- hai. Yani "banana" = bas ye column bharna.

ALTER TABLE platform.firms ADD COLUMN IF NOT EXISTS subdomain TEXT;

-- Do firms ka ek subdomain kabhi nahi (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS uq_firms_subdomain
    ON platform.firms (lower(subdomain)) WHERE subdomain IS NOT NULL;

-- Sirf url-safe naam: chhote akshar/ank/hyphen, 3-30 char, hyphen se shuru/khatam nahi
ALTER TABLE platform.firms DROP CONSTRAINT IF EXISTS firms_subdomain_format;
ALTER TABLE platform.firms ADD CONSTRAINT firms_subdomain_format CHECK (
    subdomain IS NULL OR subdomain ~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$'
);

SELECT 'firms.subdomain ready ✓' AS status;
