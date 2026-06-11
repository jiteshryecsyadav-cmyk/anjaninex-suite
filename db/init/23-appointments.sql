-- ============================================================================
-- Migration 23 — Appointments (Active Directory)
-- Purpose: Supplier <-> Buyer meetings/visits book karna, branch + staff ke saath.
--          Staff appointment ki BRANCH se filter hote hain (Surat meeting -> Surat
--          ka staff). Common party data Core Master + supplier/buyer profiles se.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS suppliers.appointments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id           UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    branch_id         UUID REFERENCES core.branches(id),   -- meeting kis branch ke under
    visit_direction   TEXT NOT NULL DEFAULT 's2b',          -- s2b|b2s|neutral|online
    title             TEXT,
    supplier_id       UUID REFERENCES suppliers.supplier_profiles(id) ON DELETE SET NULL,
    buyer_id          UUID REFERENCES suppliers.buyer_profiles(id) ON DELETE SET NULL,
    appointment_date  DATE NOT NULL,
    appointment_time  TIME,
    duration_minutes  INT DEFAULT 60,
    city              TEXT,
    address           TEXT,
    online_link       TEXT,
    samples           JSONB DEFAULT '[]',                   -- [{name, qty, unit}]
    agenda            TEXT,
    status            TEXT DEFAULT 'draft',                 -- draft|confirmed|completed|cancelled
    outcome           TEXT,
    created_by        UUID,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now(),
    deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_appt_firm_date ON suppliers.appointments(firm_id, appointment_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_appt_branch ON suppliers.appointments(firm_id, branch_id) WHERE deleted_at IS NULL;

-- Staff assigned to an appointment (multi). Staff = hr.employee_profiles.
CREATE TABLE IF NOT EXISTS suppliers.appointment_staff (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id    UUID NOT NULL REFERENCES suppliers.appointments(id) ON DELETE CASCADE,
    employee_id       UUID NOT NULL REFERENCES hr.employee_profiles(id) ON DELETE CASCADE,
    is_lead           BOOLEAN DEFAULT FALSE,
    UNIQUE (appointment_id, employee_id)
);

-- RLS
ALTER TABLE suppliers.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers.appointments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointments_firm ON suppliers.appointments;
CREATE POLICY appointments_firm ON suppliers.appointments
    USING (firm_id = core.current_firm_id())
    WITH CHECK (firm_id = core.current_firm_id());

-- appointment_staff has no firm_id; isolate via the parent appointment.
ALTER TABLE suppliers.appointment_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers.appointment_staff FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointment_staff_firm ON suppliers.appointment_staff;
CREATE POLICY appointment_staff_firm ON suppliers.appointment_staff
    USING (EXISTS (SELECT 1 FROM suppliers.appointments a
                   WHERE a.id = appointment_id AND a.firm_id = core.current_firm_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM suppliers.appointments a
                   WHERE a.id = appointment_id AND a.firm_id = core.current_firm_id()));

COMMIT;

SELECT 'migration 23-appointments complete' AS status;
