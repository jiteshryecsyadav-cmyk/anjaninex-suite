-- 60: Party grouping (sister-concern firms)
-- Gupta Group ke andar: Gupta Sons, Gupta Brothers, Gupta Textile...
-- Har member firm ka group_name same rakho. Order group par, bill firm par.
ALTER TABLE core.contacts ADD COLUMN IF NOT EXISTS group_name text;
CREATE INDEX IF NOT EXISTS ix_contacts_group_name
  ON core.contacts (firm_id, group_name) WHERE group_name IS NOT NULL;
