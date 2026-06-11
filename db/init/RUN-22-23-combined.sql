-- ============================================================================
-- Namokara — Migration 22 + 23 combined (Buyer Profiles + Appointments)
-- pgAdmin Query Tool me ye PURI file paste karke RUN (F5) karein.
-- Safe to re-run: sab IF NOT EXISTS / DROP POLICY IF EXISTS hai.
-- ============================================================================

-- ===================== MIGRATION 22 — Buyer Profiles =======================
CREATE TABLE IF NOT EXISTS suppliers.buyer_profiles (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id           UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    contact_id        UUID NOT NULL REFERENCES core.contacts(id) ON DELETE CASCADE,
    buyer_code        TEXT,
    buyer_type        TEXT,
    brand_name        TEXT,
    categories        JSONB DEFAULT '[]',
    budget_min        NUMERIC(14,2),
    budget_max        NUMERIC(14,2),
    budget_unit       TEXT DEFAULT 'mtr',
    order_frequency   TEXT,
    payment_terms     TEXT,
    quality_pref      TEXT,
    target_customer   TEXT,
    wa_phone          TEXT,
    notes             TEXT,
    is_active         BOOLEAN DEFAULT TRUE,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now(),
    UNIQUE (firm_id, contact_id),
    UNIQUE (firm_id, buyer_code)
);

CREATE INDEX IF NOT EXISTS idx_buyer_profiles_firm ON suppliers.buyer_profiles(firm_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_buyer_profiles_contact ON suppliers.buyer_profiles(firm_id, contact_id);

ALTER TABLE suppliers.buyer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers.buyer_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS buyer_profiles_firm ON suppliers.buyer_profiles;
CREATE POLICY buyer_profiles_firm ON suppliers.buyer_profiles
    USING (firm_id = core.current_firm_id())
    WITH CHECK (firm_id = core.current_firm_id());

-- ===================== MIGRATION 23 — Appointments =========================
CREATE TABLE IF NOT EXISTS suppliers.appointments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id           UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    branch_id         UUID REFERENCES core.branches(id),
    visit_direction   TEXT NOT NULL DEFAULT 's2b',
    title             TEXT,
    supplier_id       UUID REFERENCES suppliers.supplier_profiles(id) ON DELETE SET NULL,
    buyer_id          UUID REFERENCES suppliers.buyer_profiles(id) ON DELETE SET NULL,
    appointment_date  DATE NOT NULL,
    appointment_time  TIME,
    duration_minutes  INT DEFAULT 60,
    city              TEXT,
    address           TEXT,
    online_link       TEXT,
    samples           JSONB DEFAULT '[]',
    agenda            TEXT,
    status            TEXT DEFAULT 'draft',
    outcome           TEXT,
    created_by        UUID,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now(),
    deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_appt_firm_date ON suppliers.appointments(firm_id, appointment_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_appt_branch ON suppliers.appointments(firm_id, branch_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS suppliers.appointment_staff (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id    UUID NOT NULL REFERENCES suppliers.appointments(id) ON DELETE CASCADE,
    employee_id       UUID NOT NULL REFERENCES hr.employee_profiles(id) ON DELETE CASCADE,
    is_lead           BOOLEAN DEFAULT FALSE,
    UNIQUE (appointment_id, employee_id)
);

ALTER TABLE suppliers.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers.appointments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointments_firm ON suppliers.appointments;
CREATE POLICY appointments_firm ON suppliers.appointments
    USING (firm_id = core.current_firm_id())
    WITH CHECK (firm_id = core.current_firm_id());

ALTER TABLE suppliers.appointment_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers.appointment_staff FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointment_staff_firm ON suppliers.appointment_staff;
CREATE POLICY appointment_staff_firm ON suppliers.appointment_staff
    USING (EXISTS (SELECT 1 FROM suppliers.appointments a
                   WHERE a.id = appointment_id AND a.firm_id = core.current_firm_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM suppliers.appointments a
                   WHERE a.id = appointment_id AND a.firm_id = core.current_firm_id()));

SELECT 'Migration 22 + 23 DONE — buyer_profiles + appointments ready' AS status;
