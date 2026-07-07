-- 62: Cheque Handover Register (commission agent) - kaun staff cheque le gaya, kab, commission paid/unpaid
CREATE TABLE IF NOT EXISTS trading.cheque_handovers (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id           uuid NOT NULL,
    payment_ref       text,
    supplier_name     text,
    cheque_no         text,
    bank_name         text,
    amount            numeric(14,2) DEFAULT 0,
    cheque_date       date,
    taken_by          text NOT NULL,
    handed_date       date NOT NULL,
    handed_by         text,
    commission_paid   boolean DEFAULT false,
    commission_amount numeric(14,2) DEFAULT 0,
    remark            text,
    created_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cheque_handovers_firm ON trading.cheque_handovers(firm_id, handed_date DESC);
ALTER TABLE trading.cheque_handovers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS firm_isolation_cheque_handovers ON trading.cheque_handovers;
CREATE POLICY firm_isolation_cheque_handovers ON trading.cheque_handovers USING (firm_id = current_firm_id());
