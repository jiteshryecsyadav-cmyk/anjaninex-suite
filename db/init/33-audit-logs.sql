-- 33: Global activity/audit log — har module me kisne entry ki / edit kiya / delete kiya
CREATE TABLE IF NOT EXISTS platform.audit_logs (
    id           bigserial PRIMARY KEY,
    firm_id      uuid,
    user_id      uuid,
    module       varchar(30)  NOT NULL,            -- core | trading | accounting | ad | hr | platform | ai
    table_name   varchar(80)  NOT NULL,            -- entity/table jis par action hua
    entity_id    varchar(60),                      -- record ka id
    entity_label varchar(200),                     -- naam/number jisse pehchan ho (DisplayName/BillNo/...)
    action       varchar(10)  NOT NULL,            -- insert | update | delete
    changes      jsonb,                            -- update par: { field: {old, new} }
    created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_firm_time ON platform.audit_logs (firm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module    ON platform.audit_logs (firm_id, module, created_at DESC);

COMMENT ON TABLE platform.audit_logs IS 'Global activity log — auto-captured by EF SaveChanges interceptor';
