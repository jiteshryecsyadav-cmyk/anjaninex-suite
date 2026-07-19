-- Exhibition discount validity window on party groups.
-- Exhibition disc % applies ONLY when a bill's date falls within [exhibition_from, exhibition_to].
ALTER TABLE core.party_groups ADD COLUMN IF NOT EXISTS exhibition_from date;
ALTER TABLE core.party_groups ADD COLUMN IF NOT EXISTS exhibition_to   date;
