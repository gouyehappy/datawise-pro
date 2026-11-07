package org.apache.datawise.backend.ai.schema;

/**
 * JDBC 元数据推断的外键/关联，供 SQL 生成 prompt 使用
 */
public record AiTableRelationHint(
        String fromTable,
        String fromColumn,
        String toTable,
        String toColumn
) {
    public String describe() {
        return fromTable + "." + fromColumn + " -> " + toTable + "." + toColumn;
    }
}
