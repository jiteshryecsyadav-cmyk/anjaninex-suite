-- ============================================================
-- 48: Bill line DESCRIPTION column
-- Bill item rows ka "Description" (e.g. Saree) ab save/edit hota hai.
-- Order lines aur GR lines me pehle se tha; bill lines me chhoot gaya tha.
-- Idempotent — baar baar chalana safe hai.
-- ============================================================
ALTER TABLE trading.bill_lines
    ADD COLUMN IF NOT EXISTS description TEXT;
