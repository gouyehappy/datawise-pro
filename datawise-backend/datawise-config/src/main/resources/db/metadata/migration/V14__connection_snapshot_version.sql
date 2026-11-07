-- Optimistic concurrency for multi-instance connection catalog writes
ALTER TABLE dw_connection_snapshots ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
