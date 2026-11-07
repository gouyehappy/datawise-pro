-- SQL execution history (one row per entry)
CREATE TABLE dw_sql_history (
    id VARCHAR(128) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    connection_id VARCHAR(128),
    database_name VARCHAR(512),
    sql_text CLOB,
    duration_ms BIGINT,
    row_count INTEGER,
    status VARCHAR(64),
    executed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_dw_sql_history_user_executed
    ON dw_sql_history (user_id, executed_at DESC);
