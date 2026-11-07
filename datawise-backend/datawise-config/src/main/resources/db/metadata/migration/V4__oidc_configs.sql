-- Per-tenant OIDC config JSON (same shape as oidc.json)
CREATE TABLE dw_oidc_configs (
    tenant_id VARCHAR(128) PRIMARY KEY,
    payload CLOB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE
);
