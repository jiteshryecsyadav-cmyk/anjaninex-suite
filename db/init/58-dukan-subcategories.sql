-- Online Dukan — sub-categories.
-- Self-reference on dukan.categories: parent_id NULL = top-level category,
-- set = sub-category nested under the parent. Deleting a parent cascades to subs.
ALTER TABLE dukan.categories
  ADD COLUMN IF NOT EXISTS parent_id uuid NULL
  REFERENCES dukan.categories(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ix_dukan_categories_parent
  ON dukan.categories(firm_id, parent_id);
