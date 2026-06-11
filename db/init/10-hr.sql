-- ============================================================================
-- Namokara Suite — HR Module Tables
-- Staff, Attendance with selfie, Live GPS tracking, Leave, Payroll
-- ============================================================================

-- =================================================
-- 1. ATTENDANCE POLICY (per branch)
-- =================================================
CREATE TABLE hr.attendance_policies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    branch_id       UUID REFERENCES core.branches(id),
    name            TEXT NOT NULL,
    work_start_time TIME DEFAULT '09:30',
    work_end_time   TIME DEFAULT '18:30',
    late_grace_min  INT DEFAULT 15,
    half_day_threshold_min INT DEFAULT 240,    -- < 4 hours = half day
    full_day_min    INT DEFAULT 480,           -- 8 hours
    weekend_days    JSONB DEFAULT '[0]',       -- 0=Sun, 6=Sat
    half_day_weekends JSONB DEFAULT '[]',      -- 1st & 3rd Sat etc.
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- =================================================
-- 2. HOLIDAYS
-- =================================================
CREATE TABLE hr.holidays (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    branch_id       UUID REFERENCES core.branches(id),   -- NULL = all branches
    holiday_date    DATE NOT NULL,
    name            TEXT NOT NULL,
    holiday_type    TEXT DEFAULT 'mandatory',  -- mandatory|optional|restricted
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_holidays_firm_date ON hr.holidays(firm_id, holiday_date);

-- =================================================
-- 3. SALARY STRUCTURES (template)
-- =================================================
CREATE TABLE hr.salary_structures (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    monthly_ctc     NUMERIC(12,2) NOT NULL,
    basic_percent   NUMERIC(5,2) DEFAULT 50,    -- 50% of CTC
    hra_percent     NUMERIC(5,2) DEFAULT 20,    -- 20% of CTC
    components      JSONB DEFAULT '{}',          -- {special: 1000, conveyance: 1600, medical: 1250}
    pf_applicable   BOOLEAN DEFAULT TRUE,
    esi_applicable  BOOLEAN DEFAULT TRUE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- =================================================
-- 4. EMPLOYEE PROFILES (extends core.contacts)
-- =================================================
CREATE TABLE hr.employee_profiles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    contact_id      UUID NOT NULL REFERENCES core.contacts(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES core.users(id),
    employee_code   TEXT,
    designation     TEXT,
    department      TEXT,
    joining_date    DATE,
    leaving_date    DATE,
    salary_structure_id UUID REFERENCES hr.salary_structures(id),
    branch_id       UUID REFERENCES core.branches(id),
    department_id   UUID REFERENCES core.departments(id),
    reporting_to    UUID REFERENCES hr.employee_profiles(id),
    aadhaar_hash    TEXT,    -- hashed for privacy
    pan_number      TEXT,
    pf_number       TEXT,
    esi_number      TEXT,
    bank_account_no_hash TEXT,
    bank_ifsc       TEXT,
    bank_name       TEXT,
    profile_selfie_url TEXT,    -- baseline selfie for face match
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (firm_id, employee_code),
    UNIQUE (firm_id, contact_id)
);
CREATE INDEX idx_employees_firm_active ON hr.employee_profiles(firm_id) WHERE is_active = TRUE;
CREATE INDEX idx_employees_branch ON hr.employee_profiles(branch_id);
CREATE INDEX idx_employees_user ON hr.employee_profiles(user_id) WHERE user_id IS NOT NULL;

-- =================================================
-- 5. ATTENDANCE LOGS (daily punch records)
-- =================================================
CREATE TABLE hr.attendance_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL,
    employee_id     UUID NOT NULL REFERENCES hr.employee_profiles(id),
    log_date        DATE NOT NULL,

    -- Check-in
    check_in_at     TIMESTAMPTZ,
    check_in_lat    NUMERIC(9,6),
    check_in_lng    NUMERIC(9,6),
    check_in_selfie_url TEXT,
    check_in_address TEXT,
    check_in_accuracy NUMERIC(6,2),

    -- Check-out
    check_out_at    TIMESTAMPTZ,
    check_out_lat   NUMERIC(9,6),
    check_out_lng   NUMERIC(9,6),
    check_out_selfie_url TEXT,
    check_out_address TEXT,
    check_out_accuracy NUMERIC(6,2),

    -- Computed
    total_minutes   INT,
    status          TEXT,          -- present|absent|half_day|leave|holiday|late
    is_late         BOOLEAN DEFAULT FALSE,
    is_early_out    BOOLEAN DEFAULT FALSE,
    notes           TEXT,

    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (employee_id, log_date)
);
CREATE INDEX idx_att_logs_emp_date ON hr.attendance_logs(employee_id, log_date DESC);
CREATE INDEX idx_att_logs_firm_date ON hr.attendance_logs(firm_id, log_date DESC);

-- =================================================
-- 6. LOCATION TRAILS (partitioned by month due to high volume)
-- =================================================
CREATE TABLE hr.location_trails (
    id              BIGSERIAL,
    firm_id         UUID NOT NULL,
    employee_id     UUID NOT NULL,
    captured_at     TIMESTAMPTZ NOT NULL,
    latitude        NUMERIC(9,6) NOT NULL,
    longitude       NUMERIC(9,6) NOT NULL,
    accuracy        NUMERIC(6,2),
    speed           NUMERIC(6,2),
    battery_pct     SMALLINT,
    is_background   BOOLEAN DEFAULT FALSE,
    address         TEXT,
    PRIMARY KEY (id, captured_at)
) PARTITION BY RANGE (captured_at);

-- Create monthly partitions for current + next 12 months
CREATE TABLE hr.location_trails_2026_05 PARTITION OF hr.location_trails
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE hr.location_trails_2026_06 PARTITION OF hr.location_trails
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE hr.location_trails_2026_07 PARTITION OF hr.location_trails
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE hr.location_trails_2026_08 PARTITION OF hr.location_trails
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE hr.location_trails_2026_09 PARTITION OF hr.location_trails
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE hr.location_trails_2026_10 PARTITION OF hr.location_trails
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE hr.location_trails_2026_11 PARTITION OF hr.location_trails
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE hr.location_trails_2026_12 PARTITION OF hr.location_trails
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE INDEX idx_lt_emp_time ON hr.location_trails(employee_id, captured_at);
CREATE INDEX idx_lt_firm_time ON hr.location_trails(firm_id, captured_at DESC);

-- =================================================
-- 7. SELFIES (separate table for queryability)
-- =================================================
CREATE TABLE hr.selfies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL,
    employee_id     UUID NOT NULL REFERENCES hr.employee_profiles(id),
    storage_url     TEXT NOT NULL,
    thumbnail_url   TEXT,
    context         TEXT NOT NULL,     -- 'check_in'|'check_out'|'profile'|'login'
    captured_at     TIMESTAMPTZ NOT NULL,
    lat             NUMERIC(9,6),
    lng             NUMERIC(9,6),
    accuracy        NUMERIC(6,2),
    face_verified   BOOLEAN,           -- after admin review or AI face match
    notes           TEXT
);
CREATE INDEX idx_selfies_emp_time ON hr.selfies(employee_id, captured_at DESC);

-- =================================================
-- 8. LEAVE BALANCES (per year per type per employee)
-- =================================================
CREATE TABLE hr.leave_balances (
    employee_id     UUID NOT NULL REFERENCES hr.employee_profiles(id) ON DELETE CASCADE,
    year            INT NOT NULL,
    leave_type      TEXT NOT NULL,           -- sick|casual|earned|comp_off|maternity
    total_allocated NUMERIC(5,2) NOT NULL,
    used            NUMERIC(5,2) DEFAULT 0,
    available       NUMERIC(5,2) GENERATED ALWAYS AS (total_allocated - used) STORED,
    PRIMARY KEY (employee_id, year, leave_type)
);

-- =================================================
-- 9. LEAVE REQUESTS
-- =================================================
CREATE TABLE hr.leave_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL,
    employee_id     UUID NOT NULL REFERENCES hr.employee_profiles(id),
    leave_type      TEXT NOT NULL,
    from_date       DATE NOT NULL,
    to_date         DATE NOT NULL,
    days_count      NUMERIC(5,2) NOT NULL,
    half_day_start  BOOLEAN DEFAULT FALSE,
    half_day_end    BOOLEAN DEFAULT FALSE,
    reason          TEXT,
    document_url    TEXT,
    status          TEXT DEFAULT 'pending',  -- pending|approved|rejected|cancelled
    approved_by     UUID,
    approved_at     TIMESTAMPTZ,
    remarks         TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_leave_req_firm_status ON hr.leave_requests(firm_id, status, from_date DESC);
CREATE INDEX idx_leave_req_emp ON hr.leave_requests(employee_id, from_date DESC);

-- =================================================
-- 10. PAYROLL RECORDS (monthly per employee)
-- =================================================
CREATE TABLE hr.payroll_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL,
    employee_id     UUID NOT NULL REFERENCES hr.employee_profiles(id),
    period_year     INT NOT NULL,
    period_month    INT NOT NULL,

    -- Earnings
    basic           NUMERIC(12,2) DEFAULT 0,
    hra             NUMERIC(12,2) DEFAULT 0,
    da              NUMERIC(12,2) DEFAULT 0,
    special         NUMERIC(12,2) DEFAULT 0,
    conveyance      NUMERIC(12,2) DEFAULT 0,
    medical         NUMERIC(12,2) DEFAULT 0,
    bonus           NUMERIC(12,2) DEFAULT 0,
    incentive       NUMERIC(12,2) DEFAULT 0,
    overtime_amount NUMERIC(12,2) DEFAULT 0,
    other_earnings  NUMERIC(12,2) DEFAULT 0,
    gross_salary    NUMERIC(12,2),

    -- Deductions
    pf_employee     NUMERIC(12,2) DEFAULT 0,
    esi_employee    NUMERIC(12,2) DEFAULT 0,
    tds             NUMERIC(12,2) DEFAULT 0,
    professional_tax NUMERIC(12,2) DEFAULT 0,
    loan_deduction  NUMERIC(12,2) DEFAULT 0,
    advance_deduction NUMERIC(12,2) DEFAULT 0,
    lop_deduction   NUMERIC(12,2) DEFAULT 0,
    other_deductions NUMERIC(12,2) DEFAULT 0,
    total_deductions NUMERIC(12,2),

    -- Employer contributions (CTC)
    pf_employer     NUMERIC(12,2) DEFAULT 0,
    esi_employer    NUMERIC(12,2) DEFAULT 0,

    -- Result
    net_salary      NUMERIC(12,2),

    -- Attendance
    days_in_month   INT,
    days_present    NUMERIC(5,2),
    days_absent     NUMERIC(5,2),
    days_paid_leave NUMERIC(5,2),
    overtime_hours  NUMERIC(6,2),

    -- Payment
    is_paid         BOOLEAN DEFAULT FALSE,
    paid_at         TIMESTAMPTZ,
    voucher_id      UUID REFERENCES accounting.vouchers(id),
    bank_txn_ref    TEXT,
    payslip_url     TEXT,

    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (employee_id, period_year, period_month)
);
CREATE INDEX idx_payroll_firm_period ON hr.payroll_records(firm_id, period_year DESC, period_month DESC);

-- =================================================
-- RLS
-- =================================================
ALTER TABLE hr.attendance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.holidays            ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.salary_structures   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.employee_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.attendance_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.location_trails     ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.selfies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.leave_balances      ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.leave_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.payroll_records     ENABLE ROW LEVEL SECURITY;

CREATE POLICY firm_iso_att_pol   ON hr.attendance_policies USING (firm_id = current_firm_id());
CREATE POLICY firm_iso_holidays  ON hr.holidays            USING (firm_id = current_firm_id());
CREATE POLICY firm_iso_sal_str   ON hr.salary_structures   USING (firm_id = current_firm_id());
CREATE POLICY firm_iso_emps      ON hr.employee_profiles   USING (firm_id = current_firm_id());
CREATE POLICY firm_iso_att_logs  ON hr.attendance_logs     USING (firm_id = current_firm_id());
CREATE POLICY firm_iso_trails    ON hr.location_trails     USING (firm_id = current_firm_id());
CREATE POLICY firm_iso_selfies   ON hr.selfies             USING (firm_id = current_firm_id());
CREATE POLICY firm_iso_lv_bal    ON hr.leave_balances      USING (
    EXISTS (SELECT 1 FROM hr.employee_profiles e
            WHERE e.id = leave_balances.employee_id AND e.firm_id = current_firm_id()));
CREATE POLICY firm_iso_lv_req    ON hr.leave_requests      USING (firm_id = current_firm_id());
CREATE POLICY firm_iso_payroll   ON hr.payroll_records     USING (firm_id = current_firm_id());

SELECT 'HR tables created ✓' AS status;
