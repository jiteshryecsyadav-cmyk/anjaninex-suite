-- ============================================================================
-- 103: Bazaar Bot — photo ke saath SUPPLIER KI CHAT (thread) bhi yaad rakho
-- ============================================================================
-- Pehle order/bargain me supplier ko PHONE se dhundte the — ek number 4 parties
-- par ho (test/real duplicate) to sawal GALAT party ke chat me chala jata tha
-- (asli case: Aanehri ki photo, bargain B.N. Textile ke paas pahuncha).
-- Ab photo aate hi uska thread save hota hai — wahi pakka supplier ka chat.

ALTER TABLE wa.incoming ADD COLUMN IF NOT EXISTS pchat_thread_id UUID;

SELECT 'bazaar incoming thread ready ✓' AS status;
