-- 71: CREDIL score engine (V1). credil.refresh_scores() — nightly cron (postgres) chalata hai.
-- SECURITY DEFINER (owner postgres = superuser) => RLS bypass, saare firms ka data aggregate.
-- V1: Buyer/party PAYMENT score sales-bills se + 12-mahine pending red flag + volume/tenure.
-- Supplier fulfillment (delivery/quality) Phase 2 me.

CREATE OR REPLACE FUNCTION credil.refresh_scores() RETURNS integer AS $func$
DECLARE
    v_count integer := 0;
BEGIN
    INSERT INTO credil.scores AS s (
        party_gst, entity_type, total_score,
        pay_score, default_score, trade_score, volume_score,
        red_flags, data_points, firms_count, computed_at)
    SELECT
        g.gst,
        'buyer',
        -- total 300-900 = 300 + weighted(sub-scores 0-100)/100 * 600
        (300 + round(((0.45*g.pay + 0.30*g.def + 0.10*g.trade + 0.15*g.vol) / 100.0) * 600))::int,
        g.pay::int, g.def::int, g.trade::int, g.vol::int,
        g.flags,
        g.bills_count,
        g.firms_count,
        now()
    FROM (
        SELECT
            x.gst,
            x.bills_count,
            x.firms_count,
            -- Pay score: paid ratio (0-100)
            LEAST(100, GREATEST(0, round( CASE WHEN x.billed > 0 THEN (x.paid / x.billed) * 100 ELSE 60 END )))::numeric AS pay,
            -- Default score: overdue-12m + pending ratio penalty
            LEAST(100, GREATEST(0,
                100
                - LEAST(60, x.overdue_12m * 20)                                   -- har 12m+ overdue bill = -20 (max -60)
                - CASE WHEN x.billed > 0 THEN LEAST(40, round((x.pending / x.billed) * 40)) ELSE 0 END
            ))::numeric AS def,
            -- Trade score: GR-return ratio (kam returns = achha)
            LEAST(100, GREATEST(0,
                100 - CASE WHEN x.billed > 0 THEN LEAST(100, round((x.returns / x.billed) * 100)) ELSE 0 END
            ))::numeric AS trade,
            -- Volume/tenure: business size (log) + firms + tenure months
            LEAST(100, GREATEST(0,
                round( LEAST(70, ln(x.billed + 1) * 6) + LEAST(15, x.firms_count * 5) + LEAST(15, x.tenure_months) )
            ))::numeric AS vol,
            -- Red flags
            (
                CASE WHEN x.overdue_12m > 0
                     THEN jsonb_build_array(jsonb_build_object('type','bill_pending_12m',
                            'msg', x.overdue_12m || ' bill(s) 12+ mahine se pending (default risk)'))
                     ELSE '[]'::jsonb END
            ) AS flags
        FROM (
            SELECT
                c.gst_number AS gst,
                COUNT(DISTINCT b.firm_id) AS firms_count,
                COUNT(b.id) AS bills_count,
                COALESCE(SUM(b.total), 0) AS billed,
                COALESCE(SUM(b.paid_amount), 0) AS paid,
                COALESCE(SUM(b.total - b.paid_amount), 0) AS pending,
                COUNT(*) FILTER (WHERE b.status IN ('pending','partial','overdue')
                                   AND b.bill_date < current_date - INTERVAL '365 days') AS overdue_12m,
                COALESCE((SELECT SUM(gr.total_return_amount) FROM trading.goods_returns gr
                          JOIN trading.party_profiles p2 ON p2.id = gr.buyer_party_id
                          JOIN core.contacts c2 ON c2.id = p2.contact_id
                          WHERE c2.gst_number = c.gst_number), 0) AS returns,
                GREATEST(1, (EXTRACT(YEAR FROM age(current_date, MIN(b.bill_date))) * 12
                           + EXTRACT(MONTH FROM age(current_date, MIN(b.bill_date))))::int) AS tenure_months
            FROM core.contacts c
            JOIN trading.party_profiles p ON p.contact_id = c.id
            -- BUYER score hai: broker bills me buyer_party_id = asli buyer (migration 18).
            -- Legacy sales bills me buyer party_id me tha — isliye COALESCE fallback.
            JOIN trading.bills b ON COALESCE(b.buyer_party_id, b.party_id) = p.id
                 AND b.bill_type = 'sales' AND b.status <> 'cancelled'
            WHERE c.gst_number IS NOT NULL AND length(trim(c.gst_number)) >= 10
            GROUP BY c.gst_number
        ) x
    ) g
    ON CONFLICT (party_gst) DO UPDATE SET
        entity_type   = EXCLUDED.entity_type,
        total_score   = EXCLUDED.total_score,
        pay_score     = EXCLUDED.pay_score,
        default_score = EXCLUDED.default_score,
        trade_score   = EXCLUDED.trade_score,
        volume_score  = EXCLUDED.volume_score,
        red_flags     = EXCLUDED.red_flags,
        data_points   = EXCLUDED.data_points,
        firms_count   = EXCLUDED.firms_count,
        computed_at   = now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

-- Manual run: SELECT credil.refresh_scores();
-- Nightly cron (postgres) example: 0 2 * * *  psql -d namokara -c "SELECT credil.refresh_scores();"
