package org.apache.datawise.backend.metadata;

/**
 * 引擎无关逻辑类型，跨库 DDL 转换的中间表示（类似 SeaTunnel SeaTunnelDataType）。
 */
public enum LogicalTypeKind {
    BOOLEAN,
    TINYINT,
    SMALLINT,
    INTEGER,
    BIGINT,
    DECIMAL,
    FLOAT,
    DOUBLE,
    CHAR,
    VARCHAR,
    TEXT,
    BINARY,
    VARBINARY,
    BLOB,
    DATE,
    TIME,
    DATETIME,
    TIMESTAMP,
    JSON,
    UUID,
    ENUM,
    SET,
    UNKNOWN
}
