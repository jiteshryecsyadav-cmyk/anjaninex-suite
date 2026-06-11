-- 35: Recharge invoice/receipt + GST (20 lakh threshold)
-- Approve hote hi invoice number + GST calculation save hota hai.
ALTER TABLE platform.payment_requests
  ADD COLUMN IF NOT EXISTS invoice_no varchar(30),
  ADD COLUMN IF NOT EXISTS taxable    numeric(14,2),
  ADD COLUMN IF NOT EXISTS gst_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS gst_rate   numeric(5,2);

-- Anjaninex ka GSTIN (jab 20L cross ho to tax invoice par chahiye)
ALTER TABLE platform.billing_settings ADD COLUMN IF NOT EXISTS gstin varchar(15);

-- Sequential invoice numbering
CREATE SEQUENCE IF NOT EXISTS platform.invoice_seq;
