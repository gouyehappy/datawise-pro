-- SQL history project scope
ALTER TABLE dw_sql_history ADD COLUMN project_id VARCHAR(128);

CREATE INDEX idx_dw_sql_history_user_tenant_project_executed
    ON dw_sql_history (user_id, tenant_id, project_id, executed_at);
