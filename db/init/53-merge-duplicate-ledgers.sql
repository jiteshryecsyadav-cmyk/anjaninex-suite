-- ============================================================================
-- Migration 53: Duplicate ledgers ko MERGE karo (ek naam = ek ledger)
-- ----------------------------------------------------------------------------
-- Problem: kuch ledgers (jaise "Cash") do-do baar ban gaye the. Ye script har
-- firm me, same naam (case/space ignore) wale ledgers ko EK me jod deta hai:
--   • keeper = sabse purana (created_at min)
--   • baaki (duplicates) ki saari transactions keeper par shift:
--       - accounting.voucher_lines.ledger_id
--       - trading.party_profiles.ledger_id
--       - trading.payments.bank_ledger_id
--   • opening balance (Dr/Cr sign ke saath) jod kar keeper me set
--   • duplicate ledger row delete
--
-- ⚠️ Ek baar DB backup le lena behtar hai. Postgres superuser se chalao
--    (RLS bypass): sudo -u postgres psql -d namokara -f db/init/53-merge-duplicate-ledgers.sql
-- Idempotent: dobara chalao to kuch nahi karega (ab koi duplicate nahi bachega).
-- ============================================================================

DO $$
DECLARE
  g        RECORD;
  d        RECORD;
  v_keep   UUID;
  v_open   NUMERIC;
  v_type   CHAR(2);
  v_signed NUMERIC;
  v_merged INT := 0;
BEGIN
  FOR g IN
    SELECT firm_id, lower(btrim(name)) AS lname
    FROM accounting.ledgers
    GROUP BY firm_id, lower(btrim(name))
    HAVING count(*) > 1
  LOOP
    -- keeper = sabse purana ledger
    SELECT id, opening_balance, opening_type
      INTO v_keep, v_open, v_type
    FROM accounting.ledgers
    WHERE firm_id = g.firm_id AND lower(btrim(name)) = g.lname
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    -- signed opening (Dr = +, Cr = -), keeper se shuru
    v_signed := CASE WHEN v_type = 'Cr' THEN -COALESCE(v_open,0) ELSE COALESCE(v_open,0) END;

    FOR d IN
      SELECT id, opening_balance, opening_type
      FROM accounting.ledgers
      WHERE firm_id = g.firm_id AND lower(btrim(name)) = g.lname AND id <> v_keep
    LOOP
      UPDATE accounting.voucher_lines SET ledger_id      = v_keep WHERE ledger_id      = d.id;
      UPDATE trading.party_profiles   SET ledger_id      = v_keep WHERE ledger_id      = d.id;
      UPDATE trading.payments         SET bank_ledger_id = v_keep WHERE bank_ledger_id = d.id;

      v_signed := v_signed + CASE WHEN d.opening_type = 'Cr'
                                  THEN -COALESCE(d.opening_balance,0)
                                  ELSE  COALESCE(d.opening_balance,0) END;

      DELETE FROM accounting.ledgers WHERE id = d.id;
      v_merged := v_merged + 1;
    END LOOP;

    -- merged opening keeper par
    UPDATE accounting.ledgers
       SET opening_balance = abs(v_signed),
           opening_type    = CASE WHEN v_signed < 0 THEN 'Cr' ELSE 'Dr' END,
           updated_at      = now()
     WHERE id = v_keep;

    RAISE NOTICE 'Merged "%": keeper=% opening=%', g.lname, v_keep, v_signed;
  END LOOP;

  RAISE NOTICE 'Total duplicate ledgers merged: %', v_merged;
END $$;

-- Verify: ab koi duplicate naam nahi hona chahiye (0 rows aayein)
SELECT firm_id, lower(btrim(name)) AS name, count(*)
FROM accounting.ledgers
GROUP BY firm_id, lower(btrim(name))
HAVING count(*) > 1;
