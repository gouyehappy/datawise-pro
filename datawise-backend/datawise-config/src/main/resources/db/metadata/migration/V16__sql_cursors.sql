-- Shared SQL result cursor metadata (multi-instance paging; SqlResultCursorStore JDBC)
CREATE TABLE dw_sql_cursors (
    cursor_id VARCHAR(64) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    connection_id VARCHAR(128) NOT NULL,
    database_name VARCHAR(256),
    sql_text CLOB NOT NULL,
    session_key VARCHAR(256),
    page_size INT NOT NULL,
    next_offset INT NOT NULL,
    columns_json CLOB,
    last_accessed_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_dw_sql_cursors_last_accessed ON dw_sql_cursors (last_accessed_at);
CREATE INDEX idx_dw_sql_cursors_user ON dw_sql_cursors (user_id);
