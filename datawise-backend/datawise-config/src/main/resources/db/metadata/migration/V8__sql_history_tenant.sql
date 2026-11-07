-- SQL history tenant isolation (H2 MODE=PostgreSQL)
ALTER TABLE dw_sql_history ADD COLUMN tenant_id VARCHAR(64) DEFAULT 'default';

UPDATE dw_sql_history SET tenant_id = 'default' WHERE tenant_id IS NULL;

CREATE INDEX idx_dw_sql_history_user_tenant_executed
    ON dw_sql_history (user_id, tenant_id, executed_at);
