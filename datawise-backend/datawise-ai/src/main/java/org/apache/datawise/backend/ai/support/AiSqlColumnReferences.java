package org.apache.datawise.backend.ai.support;

import org.apache.datawise.sqlparser.analysis.SqlAnalysisSupport;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 从只读 SELECT SQL 中提取列引用（限定名 table.col / 未限定名）。
 */
public final class AiSqlColumnReferences {

    private AiSqlColumnReferences() {
    }

    public record QualifiedColumn(String tableOrAlias, String column) {
    }

    public static List<QualifiedColumn> extractQualified(String sql) {
        List<QualifiedColumn> columns = new ArrayList<>();
        for (var ref : SqlAnalysisSupport.extractQualifiedColumns(sql)) {
            columns.add(new QualifiedColumn(ref.tableOrAlias(), ref.column()));
        }
        if (columns.isEmpty()) {
            return LegacyAiSqlPatterns.extractQualifiedColumns(sql);
        }
        return columns;
    }

    public static List<String> extractUnqualified(String sql, Map<String, String> aliasToTable) {
        List<String> columns = SqlAnalysisSupport.extractUnqualifiedColumns(sql, aliasToTable);
        return columns.isEmpty() ? LegacyAiSqlPatterns.extractUnqualifiedColumns(sql, aliasToTable) : columns;
    }
}
