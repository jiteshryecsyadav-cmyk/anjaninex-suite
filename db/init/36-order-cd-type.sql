-- CD (Cash Discount) ka type: before = GST se pehle | after = GST ke baad
ALTER TABLE trading.orders
  ADD COLUMN IF NOT EXISTS cd_type TEXT NOT NULL DEFAULT 'before';

COMMENT ON COLUMN trading.orders.cd_type IS
  'before = discount GST se pehle (tax discounted base par) | after = GST ke baad (discount bill total par)';

-- Order me transporter (dropdown se) — bill autofill me bhi aayega
ALTER TABLE trading.orders
  ADD COLUMN IF NOT EXISTS transporter_id UUID REFERENCES core.transporters(id);
