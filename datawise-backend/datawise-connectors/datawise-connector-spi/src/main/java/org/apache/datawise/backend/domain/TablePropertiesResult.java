package org.apache.datawise.backend.domain;

import java.util.List;

public record TablePropertiesResult(
        String tableName,
        String comment,
        String engine,
        String charset,
        String collation,
        String autoIncrement,
        List<TableColumnDetail> columns,
        List<TableForeignKeyDetail> foreignKeys,
        List<TableIndexDetail> indexes) {
}
