-- Per-tenant daily AI usage counter
CREATE TABLE dw_tenant_ai_usage (
    tenant_id VARCHAR(128) PRIMARY KEY,
    usage_day VARCHAR(16) NOT NULL,
    call_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE
);
