-- Per-tenant connections.xml payload (encrypted secrets, same codec as file backend)
CREATE TABLE dw_connection_snapshots (
    tenant_id VARCHAR(128) PRIMARY KEY,
    payload CLOB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE
);
