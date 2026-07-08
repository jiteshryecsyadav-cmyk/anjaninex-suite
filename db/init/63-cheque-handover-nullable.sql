-- 63: Cheque handover auto-create from payment (pending) - taken_by/handed_date nullable
ALTER TABLE trading.cheque_handovers ALTER COLUMN taken_by DROP NOT NULL;
ALTER TABLE trading.cheque_handovers ALTER COLUMN handed_date DROP NOT NULL;
