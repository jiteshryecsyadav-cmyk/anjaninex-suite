-- ============================================================================
-- RESYNC — purane receipt/payment vouchers ko SAHI party (bill ki party) pe le aao
-- ----------------------------------------------------------------------------
-- Bug: pehle receipt/payment ka voucher payment.party_id (aksar BUYER) ko credit/
-- debit karta tha. Sahi yeh hai ki allocated bill ki party (broker model me SUPPLIER)
-- ki ledger hit ho — tabhi bill-party ka khata settle hone par 0 hota hai.
--
-- Yeh script har trading receipt/payment voucher ki PARTY-line ka ledger_id badal
-- kar sahi party ke ledger pe point karta hai. Amount aur Dr/Cr same rehte hain,
-- isliye voucher balanced hi rehta hai (trigger fire nahi hota).
--
-- receipt voucher  → party line = 'Cr'  (Dr = bank/cash, unchanged)
-- payment voucher  → party line = 'Dr'  (Cr = bank/cash, unchanged)
--
-- correct party = agar payment ke saare allocations EK hi bill-party ke hain to wo
-- party; warna payment.party_id (no change). Idempotent — dobara chalane par kuch
-- nahi badlega (jo pehle se sahi hai unhe chhod deta hai).
-- ============================================================================

DO $$
DECLARE
    r            RECORD;
    correct_pid  UUID;
    correct_led  UUID;
    party_drcr   TEXT;
    n_fixed      INT := 0;
    n_lines      INT;
BEGIN
    FOR r IN
        SELECT p.id          AS payment_id,
               p.party_id    AS payment_party,
               p.firm_id     AS firm_id,
               v.id          AS voucher_id,
               v.voucher_type AS vtype
        FROM   trading.payments p
        JOIN   accounting.vouchers v ON v.id = p.voucher_id
        WHERE  p.voucher_id IS NOT NULL
          AND  v.voucher_type IN ('receipt','payment')
          AND  v.deleted_at IS NULL
    LOOP
        -- 1) sahi party nikalo: allocations ki distinct bill-party (EK ho to wahi)
        SELECT CASE WHEN count(DISTINCT b.party_id) = 1
                    THEN min(b.party_id) ELSE r.payment_party END
        INTO   correct_pid
        FROM   trading.payment_allocations a
        JOIN   trading.bills b ON b.id = a.bill_id
        WHERE  a.payment_id = r.payment_id;

        -- koi allocation hi nahi to payment ki party hi sahi
        IF correct_pid IS NULL THEN
            correct_pid := r.payment_party;
        END IF;

        -- 2) us party ka ledger
        SELECT ledger_id INTO correct_led
        FROM   trading.party_profiles
        WHERE  id = correct_pid AND firm_id = r.firm_id;

        IF correct_led IS NULL THEN
            CONTINUE;   -- party ka ledger hi nahi → skip
        END IF;

        -- 3) party-line ka Dr/Cr decide karo
        party_drcr := CASE WHEN r.vtype = 'receipt' THEN 'Cr' ELSE 'Dr' END;

        -- 4) party line ka ledger sahi karo (sirf jab galat ho)
        UPDATE accounting.voucher_lines
        SET    ledger_id = correct_led
        WHERE  voucher_id = r.voucher_id
          AND  debit_credit = party_drcr
          AND  ledger_id <> correct_led;

        GET DIAGNOSTICS n_lines = ROW_COUNT;
        IF n_lines > 0 THEN
            n_fixed := n_fixed + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'RESYNC-receipt-party: fixed % voucher(s)', n_fixed;
END $$;

SELECT 'RESYNC-receipt-party complete' AS status;
