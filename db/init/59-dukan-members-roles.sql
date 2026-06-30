-- Online Dukan — multi-role shop members (shared party master, phase 1).
-- dukan.buyers becomes the "members" table: each member has a role
-- (buyer | supplier | transporter) + role-specific detail fields.
-- pin_hash now stores a bcrypt of the member's chosen password (4-20 chars).
ALTER TABLE dukan.buyers
  ADD COLUMN IF NOT EXISTS role          text NOT NULL DEFAULT 'buyer',
  ADD COLUMN IF NOT EXISTS business_name text NULL,
  ADD COLUMN IF NOT EXISTS city          text NULL,
  ADD COLUMN IF NOT EXISTS state         text NULL,
  ADD COLUMN IF NOT EXISTS address       text NULL,
  ADD COLUMN IF NOT EXISTS whatsapp      text NULL,
  ADD COLUMN IF NOT EXISTS categories    text NULL,   -- supplier: kya supply karte hain
  ADD COLUMN IF NOT EXISTS vehicle_type  text NULL,   -- transporter
  ADD COLUMN IF NOT EXISTS route_area    text NULL,   -- transporter: coverage / route
  ADD COLUMN IF NOT EXISTS capacity      text NULL;    -- transporter: load capacity

CREATE INDEX IF NOT EXISTS ix_dukan_buyers_role ON dukan.buyers(firm_id, role);
