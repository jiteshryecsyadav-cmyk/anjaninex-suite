-- ============================================================================
-- 114: Ek din me 3 BAAR TAK check-in / check-out
-- ============================================================================
-- Pehle din me ek hi baar check-in ho sakta tha ("Already checked in today").
-- Asli dhandhe me aisa nahi hota — aadmi maal dene nikalta hai, wapas aata hai,
-- phir nikalta hai. Ab din me 3 chakkar tak chalega (3 ki rok isliye ki koi
-- galti se ya jaan-boojh kar din bhar in/out na karta rahe).
--
-- Din ki EK hi row rehti hai (report/register/payroll waise ke waise chalte hain):
--   check_in_at      = din ka PEHLA aana
--   check_out_at     = ab tak ka AAKHRI jaana (dobara check-in par khali)
--   total_minutes    = saare chakkar ka JODA hua samay
--   session_start_at = chalu chakkar kab shuru hua
--   check_in_count   = aaj kitni baar check-in kiya (3 se zyada nahi)

ALTER TABLE hr.attendance_logs
  ADD COLUMN IF NOT EXISTS session_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_in_count   SMALLINT DEFAULT 1;

-- Rok kitni ho — ye firm ki policy me, taaki badalne ke liye deploy na karna pade
ALTER TABLE hr.attendance_policies
  ADD COLUMN IF NOT EXISTS max_checkins_per_day SMALLINT DEFAULT 3;

-- Purani rows: pehla check-in hi unka session start, ginti 1
UPDATE hr.attendance_logs
   SET session_start_at = COALESCE(session_start_at, check_in_at),
       check_in_count   = COALESCE(check_in_count, 1)
 WHERE check_in_at IS NOT NULL;

SELECT 'attendance multi-session ready ✓' AS status;
