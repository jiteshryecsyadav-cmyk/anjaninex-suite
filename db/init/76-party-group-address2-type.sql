-- 76: Party group me 2nd address + party type (supplier/buyer/both) + buyer type (wholesale/retailer/etc).
ALTER TABLE core.party_groups ADD COLUMN IF NOT EXISTS address2   text;
ALTER TABLE core.party_groups ADD COLUMN IF NOT EXISTS party_type text DEFAULT 'supplier';
ALTER TABLE core.party_groups ADD COLUMN IF NOT EXISTS buyer_type text;
