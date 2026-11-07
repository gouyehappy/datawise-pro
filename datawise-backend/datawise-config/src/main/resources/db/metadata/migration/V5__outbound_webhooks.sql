-- Per-tenant outbound webhook list JSON
CREATE TABLE dw_outbound_webhook_snapshots (
    tenant_id VARCHAR(128) PRIMARY KEY,
    payload CLOB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE
);
