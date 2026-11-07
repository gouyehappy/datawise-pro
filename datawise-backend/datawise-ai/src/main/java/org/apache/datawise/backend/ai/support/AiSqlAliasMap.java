package org.apache.datawise.backend.ai.support;

import org.apache.datawise.sqlparser.analysis.SqlAnalysisSupport;

import java.util.Map;

/**
 * 从 FROM / JOIN 子句解析表别名 → 真实表名。
 */
public final class AiSqlAliasMap {

    private AiSqlAliasMap() {
    }

    public static Map<String, String> build(String sql) {
        Map<String, String> aliases = SqlAnalysisSupport.buildAliasMap(sql);
        return aliases.isEmpty() ? legacyBuild(sql) : aliases;
    }

    public static String resolveTable(String tableOrAlias, Map<String, String> aliasToTable) {
        return SqlAnalysisSupport.resolveAlias(tableOrAlias, aliasToTable);
    }

    private static Map<String, String> legacyBuild(String sql) {
        return LegacyAiSqlPatterns.buildAliasMap(sql);
    }
}
