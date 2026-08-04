-- ============================================================================
-- 117: MANUFACTURER — design, material, tag, recipe
-- ============================================================================
-- Design aur Material ke liye NAYI table nahi banayi.
--
-- trading.items pehle se hai aur order/challan/invoice ki har line usi par
-- tikti hai. Parallel table banate to har jagah do rasta rakhna padta —
-- "line design ki hai ya item ki?" — aur ek din dono ka stock alag ho jata.
-- Isliye items par ek `item_kind` aur manufacturer ke khaane jod diye.
--
--   item_kind = 'design'   → jo hum banate aur bechte hain
--   item_kind = 'material' → kachcha maal (kapda, dhaaga, zip, packing)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. trading.items ko manufacturer layak banao
-- ----------------------------------------------------------------------------
ALTER TABLE trading.items
  -- Default 'other' — 'design' NAHI.
  -- Purani saari items na design hain na material; wo aam trading item hain.
  -- Default 'design' rakhte to lakhon purani rows ek jhatke me "design" ban
  -- jaati aur manufacturer ki har list/filter me aa jaati. Unhe wapas theek
  -- karne ke liye UPDATE likhna padta — aur wo UPDATE dobara chalane par
  -- nayi bani design ko bhi 'other' bana deta. Isliye default hi 'other',
  -- aur naya design/material app khud saaf-saaf likhta hai.
  ADD COLUMN IF NOT EXISTS item_kind         TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS photo_url         TEXT,
  ADD COLUMN IF NOT EXISTS description       TEXT,
  ADD COLUMN IF NOT EXISTS colour_hint       TEXT,   -- list me gol nishaan
  -- Apna maal khatam hone se PEHLE chetavni
  ADD COLUMN IF NOT EXISTS min_stock_qty     NUMERIC(14,3),
  -- Buyer isse kam ka order na de sake (sirf apni online dukan par)
  ADD COLUMN IF NOT EXISTS min_order_qty     NUMERIC(14,3),
  -- Set me bikta hai to ek set me kitne piece
  ADD COLUMN IF NOT EXISTS set_pieces        SMALLINT,
  ADD COLUMN IF NOT EXISTS show_out_of_stock BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sample_price      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS sample_source     TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'items_item_kind_chk') THEN
    ALTER TABLE trading.items
      ADD CONSTRAINT items_item_kind_chk
      CHECK (item_kind IN ('design','material','other'));
  END IF;
END $$;

COMMENT ON COLUMN trading.items.item_kind IS
  'design = jo hum banate hain · material = kachcha maal · other = purana data';
COMMENT ON COLUMN trading.items.min_stock_qty IS
  'Stock isse kam ho to chetavni — maal khatam hone se pehle dobara banwa lein';

CREATE INDEX IF NOT EXISTS items_firm_kind_ix
    ON trading.items (firm_id, item_kind) WHERE is_active;

-- ----------------------------------------------------------------------------
-- 2. DESIGN TAG — master list se, warna filter kaam nahi karta
--    (koi "cotton" likhta hai koi "Cotton" — dono alag tag ban jaate the
--     aur filter me aadha maal gayab ho jata tha)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mfg.design_tags (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id    UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS design_tags_firm_name_uq
    ON mfg.design_tags (firm_id, lower(name));

CREATE TABLE IF NOT EXISTS mfg.item_tags (
    firm_id UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES trading.items(id)   ON DELETE CASCADE,
    tag_id  UUID NOT NULL REFERENCES mfg.design_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, tag_id)
);
CREATE INDEX IF NOT EXISTS item_tags_tag_ix ON mfg.item_tags (tag_id);

-- ----------------------------------------------------------------------------
-- 3. DESIGN RECIPE — hisse ke hisab se
--
-- Ek suit ke teen hisse hote hain (Top, Bottom, Dupatta) aur teeno ka kapda
-- alag aur majoori alag. Isliye recipe HISSE par bandhi hai, ek lambi list
-- nahi. Do faayde:
--   1. Job slip me hissa chunte hi us hisse ka material apne aap bhar jata hai
--   2. Ek piece ki asli lagat abhi pata chal jati hai — daam tay karte waqt
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mfg.design_recipes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id    UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    design_id  UUID NOT NULL REFERENCES trading.items(id)  ON DELETE CASCADE,
    part       TEXT NOT NULL,   -- Top / Bottom / Dupatta / Blouse / Lining
    job_rate   NUMERIC(12,2) NOT NULL DEFAULT 0,   -- is hisse ki majoori
    rate_unit  TEXT NOT NULL DEFAULT 'Pcs',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Ek design ke ek hisse ki ek hi recipe
CREATE UNIQUE INDEX IF NOT EXISTS design_recipes_design_part_uq
    ON mfg.design_recipes (design_id, part);

CREATE TABLE IF NOT EXISTS mfg.design_recipe_materials (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    recipe_id   UUID NOT NULL REFERENCES mfg.design_recipes(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES trading.items(id),
    -- EK PIECE me kitna lagta hai. Kul = piece × avg_qty.
    -- 156 piece × 2.25 mtr = 351 mtr — ye hisab pehle kaagaz par hota tha
    -- aur har baar naye sire se lagana padta tha.
    avg_qty     NUMERIC(12,3) NOT NULL CHECK (avg_qty > 0),
    unit        TEXT NOT NULL DEFAULT 'Meter'
);
CREATE INDEX IF NOT EXISTS recipe_materials_recipe_ix
    ON mfg.design_recipe_materials (recipe_id);

-- Ek piece ki lagat — kapda + majoori. Daam tay karte waqt sabse kaam ki ginti.
CREATE OR REPLACE VIEW mfg.v_design_cost AS
SELECT r.firm_id,
       r.design_id,
       r.part,
       r.job_rate,
       COALESCE(SUM(rm.avg_qty * COALESCE(m.default_rate, 0)), 0) AS material_cost,
       r.job_rate + COALESCE(SUM(rm.avg_qty * COALESCE(m.default_rate, 0)), 0) AS part_cost
  FROM mfg.design_recipes r
  LEFT JOIN mfg.design_recipe_materials rm ON rm.recipe_id = r.id
  LEFT JOIN trading.items m                ON m.id = rm.material_id
 GROUP BY r.firm_id, r.design_id, r.part, r.job_rate;

COMMENT ON VIEW mfg.v_design_cost IS
  'Har hisse ki lagat = kapda + majoori. Design ki poori lagat = saare hisso ka jod. '
  'Bechne ke daam se ghata rahe to screen par laal dikhta hai.';

-- ----------------------------------------------------------------------------
-- 4. RLS
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['design_tags','item_tags','design_recipes',
                           'design_recipe_materials'] LOOP
    EXECUTE format('ALTER TABLE mfg.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE mfg.%I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON mfg.%I', t || '_firm_iso', t);
    EXECUTE format(
      'CREATE POLICY %I ON mfg.%I
         USING (firm_id = core.current_firm_id())
         WITH CHECK (firm_id = core.current_firm_id())', t || '_firm_iso', t);
  END LOOP;
END $$;

SELECT core.assert_rls_policies(ARRAY['mfg']);

SELECT 'manufacturer design/recipe tayyar ✓' AS status;
