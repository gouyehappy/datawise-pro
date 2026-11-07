-- Per-capability AI usage breakdown (JSON map capability -> count)
ALTER TABLE dw_tenant_ai_usage ADD COLUMN capability_json VARCHAR(4096);
