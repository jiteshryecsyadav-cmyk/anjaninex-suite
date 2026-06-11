-- ============================================================================
-- Orders ko theek karo — bill ASLI (original) order se order_id FK se judi hai.
--   Original JPR-O1/O2/O3 soft-delete ho gaye the (buggy update) par bill unse judi hai.
--   JPR-O10/O11/O12 recreated ORPHAN copies hain (koi bill linked nahi).
--
-- Fix: original (bill-linked) ko RESTORE karo, orphan copies DELETE karo.
-- ============================================================================

DO $$
DECLARE orphan_ids UUID[];
BEGIN
    -- 1. Orphan recreated orders (jinse koi bill linked NAHI) dhoondo
    SELECT array_agg(o.id) INTO orphan_ids
    FROM trading.orders o
    WHERE o.order_no IN ('JPR-O10', 'JPR-O11', 'JPR-O12')
      AND NOT EXISTS (SELECT 1 FROM trading.bills b WHERE b.order_id = o.id);

    -- 2. Orphan copies + unke lines delete
    IF orphan_ids IS NOT NULL THEN
        DELETE FROM trading.order_lines WHERE order_id = ANY(orphan_ids);
        DELETE FROM trading.orders      WHERE id = ANY(orphan_ids);
    END IF;

    -- 3. Original (bill-linked) JPR-O1/O2/O3 ko wapas live karo (un-delete)
    UPDATE trading.orders SET deleted_at = NULL
    WHERE order_no IN ('JPR-O1', 'JPR-O2', 'JPR-O3') AND deleted_at IS NOT NULL;
END $$;

-- Verify
SELECT order_no, status,
       (SELECT count(*) FROM trading.order_lines l WHERE l.order_id = o.id) AS items,
       (SELECT count(*) FROM trading.bills b WHERE b.order_id = o.id)        AS bills
FROM trading.orders o
WHERE deleted_at IS NULL
ORDER BY order_no;
