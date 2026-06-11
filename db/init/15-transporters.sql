-- =================================================
-- TRANSPORTERS — freight & delivery partners
-- =================================================

CREATE TABLE IF NOT EXISTS core.transporters (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id             UUID NOT NULL,

    firm_name           TEXT NOT NULL,
    contact_person      TEXT,
    mobile              TEXT,
    whatsapp            TEXT,
    gst_no              TEXT,
    pan                 TEXT,
    city                TEXT,
    state               TEXT,
    pincode             TEXT,
    email               TEXT,
    address             TEXT,
    contact_mobile      TEXT,
    landline            TEXT,

    avg_delivery_days   INT,
    damage_rate         NUMERIC(5,2),
    rating              TEXT,
    stars               INT,

    remark              TEXT,

    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transporters_firm ON core.transporters(firm_id);
CREATE INDEX IF NOT EXISTS idx_transporters_name ON core.transporters(firm_id, firm_name);
