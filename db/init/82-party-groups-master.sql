-- 82: PARTY GROUPS MASTER — khali group bhi save ho sake (pehle naam, firms baad me).
-- Pehle group sirf contacts.group_name se banta tha — 0 members = group gayab.
-- RLS nahi (Complaint Box pattern) — har query app-layer par firm_id se filter hoti hai.

CREATE TABLE IF NOT EXISTS core.party_groups (
    firm_id    uuid NOT NULL REFERENCES platform.firms(id) ON DELETE CASCADE,
    name       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (firm_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON core.party_groups TO namokara_app;

-- Purane groups (jo contacts par likhe hain) master me bhi daal do
INSERT INTO core.party_groups (firm_id, name)
SELECT DISTINCT firm_id, group_name FROM core.contacts
WHERE group_name IS NOT NULL AND group_name <> '' AND deleted_at IS NULL
ON CONFLICT DO NOTHING;

SELECT 'party groups master ✓' AS status;
