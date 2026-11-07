-- Per-tenant team snapshot (same shape as tenants/{id}/teams.json)
CREATE TABLE dw_team_snapshots (
    tenant_id VARCHAR(128) PRIMARY KEY,
    payload CLOB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE
);
