-- 76: firm status me 'deleted' allow karo (soft delete ke liye)
-- 12-subscription-lifecycle.sql wala check constraint 'deleted' nahi maanta tha
-- → sadmin Delete par 23514 "Status value galat hai" aata tha.

ALTER TABLE platform.firms DROP CONSTRAINT IF EXISTS firms_status_chk;
ALTER TABLE platform.firms ADD CONSTRAINT firms_status_chk CHECK (
  status IN ('trial','active','grace_period','suspended','cancelled','low_wallet','churned','deleted')
);
