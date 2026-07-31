-- ============================================================================
-- 110: Bazaar — EK ORDER me KAI ITEM (asli bill jaisa) + Party ka MENU bot
-- ============================================================================
-- Ab tak: ek photo = ek order. Buyer ko har photo par alag ORDER dabana padta tha.
-- Ab: buyer kai photo TICK karke ek saath order kare → ek hi order jisme kai line
-- (alag-alag supplier ki photo ho to supplier-wise alag order — wahi sahi hai).

CREATE TABLE IF NOT EXISTS wa.order_items (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id       UUID NOT NULL REFERENCES wa.orders(id) ON DELETE CASCADE,
    incoming_id    UUID,                       -- kaunsi photo
    track_code     TEXT,                       -- BZ-XXXXXX-Rxxx
    category_name  TEXT,
    rate           NUMERIC(12,2) NOT NULL DEFAULT 0,
    rate_unit      TEXT NOT NULL DEFAULT 'mtr',
    quantity       NUMERIC(14,2) NOT NULL DEFAULT 0,
    amount         NUMERIC(16,2) NOT NULL DEFAULT 0,
    image_path     TEXT,
    sort_order     INT NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_order_items_order ON wa.order_items(order_id);

-- Purane single-photo orders bhi isi dhaanche me dikh sakein (ek item wali line)
INSERT INTO wa.order_items (order_id, incoming_id, track_code, category_name,
                            rate, rate_unit, quantity, amount, image_path, sort_order)
SELECT o.id, o.incoming_id, o.track_code, o.category_name,
       COALESCE(o.rate,0), COALESCE(o.rate_unit,'mtr'), COALESCE(o.quantity,0),
       COALESCE(o.amount,0), o.image_path, 0
FROM wa.orders o
WHERE NOT EXISTS (SELECT 1 FROM wa.order_items i WHERE i.order_id = o.id);

-- Party ka MENU bot — kisne kab kya dekha (audit + baad me report ke liye)
CREATE TABLE IF NOT EXISTS platform.party_menu_log (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id    UUID NOT NULL,
    thread_id  UUID NOT NULL,
    party_name TEXT,
    choice     TEXT NOT NULL,        -- '1' / '1.2' / 'menu'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_party_menu_log_firm ON platform.party_menu_log(firm_id, created_at DESC);

-- Menu on/off (firm-wise) — sadmin Feature Flags se
INSERT INTO platform.feature_flags (key, name, description, enabled_all)
VALUES ('party_menu', 'Party Chat: Self-service Menu',
        'Party "hi" likhe to menu — bakaya, statement, orders, naya stock. Baki messages par bot chup rehta hai.',
        true)
ON CONFLICT (key) DO NOTHING;

SELECT 'bazaar multi-item + party menu ready ✓' AS status;
