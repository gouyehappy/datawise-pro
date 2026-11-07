package org.apache.datawise.backend.ai.support;

import org.apache.datawise.sqlparser.analysis.SqlAnalysisSupport;

import java.util.List;

/**
 * 从 SQL 中提取 FROM / JOIN 引用的表名（不含别名）
 */
public final class AiSqlReferencedTables {

    private AiSqlReferencedTables() {
    }

    public static List<String> extract(String sql) {
        List<String> tables = SqlAnalysisSupport.extractReferencedTables(sql);
        return tables.isEmpty() ? legacyExtract(sql) : tables;
    }

    private static List<String> legacyExtract(String sql) {
        return LegacyAiSqlPatterns.extractTables(sql);
    }
}
