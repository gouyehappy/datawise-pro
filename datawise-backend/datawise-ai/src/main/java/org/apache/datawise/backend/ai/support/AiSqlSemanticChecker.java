package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.schema.AiSqlSchemaContext;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 轻量 SQL 语义校验：表引用与列名（基于 DDL）检查。
 */
public final class AiSqlSemanticChecker {

    private AiSqlSemanticChecker() {
    }

    public record SemanticCheckResult(boolean ok, String message, boolean columnIssue) {
        public static SemanticCheckResult pass() {
            return new SemanticCheckResult(true, "", false);
        }

        public static SemanticCheckResult tableFail(String message) {
            return new SemanticCheckResult(false, message, false);
        }

        public static SemanticCheckResult columnFail(String message) {
            return new SemanticCheckResult(false, message, true);
        }
    }

    public static SemanticCheckResult check(String sql, AiSqlSchemaContext schema) {
        if (sql == null || sql.isBlank() || schema == null) {
            return SemanticCheckResult.pass();
        }

        SemanticCheckResult tableResult = checkTables(sql, schema);
        if (!tableResult.ok()) {
            return tableResult;
        }

        return checkColumns(sql, schema);
    }

    private static SemanticCheckResult checkTables(String sql, AiSqlSchemaContext schema) {
        List<String> referenced = AiSqlReferencedTables.extract(sql);
        if (referenced.isEmpty()) {
            return SemanticCheckResult.pass();
        }
        Set<String> allowed = new HashSet<>();
        if (schema.tables() != null) {
            for (String table : schema.tables()) {
                if (table != null) {
                    allowed.add(table.toLowerCase(Locale.ROOT));
                }
            }
        }
        if (schema.tableDdls() != null) {
            schema.tableDdls().forEach(ddl -> {
                if (ddl.table() != null) {
                    allowed.add(ddl.table().toLowerCase(Locale.ROOT));
                }
            });
        }
        if (allowed.isEmpty()) {
            return SemanticCheckResult.pass();
        }
        List<String> unknown = referenced.stream()
                .filter(table -> !allowed.contains(table.toLowerCase(Locale.ROOT)))
                .toList();
        if (unknown.isEmpty()) {
            return SemanticCheckResult.pass();
        }
        return SemanticCheckResult.tableFail(
                "SQL 引用了 schema 中不存在的表: " + String.join(", ", unknown)
                        + "。请仅使用 prompt 中列出的表名。"
        );
    }

    private static SemanticCheckResult checkColumns(String sql, AiSqlSchemaContext schema) {
        Map<String, Set<String>> columnIndex = AiDdlColumnIndex.fromDdls(schema.tableDdls());
        if (columnIndex.isEmpty()) {
            return SemanticCheckResult.pass();
        }

        List<String> referencedTables = AiSqlReferencedTables.extract(sql);
        if (referencedTables.isEmpty()) {
            return SemanticCheckResult.pass();
        }

        Map<String, String> aliasToTable = AiSqlAliasMap.build(sql);
        List<String> unknownColumns = new ArrayList<>();

        for (AiSqlColumnReferences.QualifiedColumn ref : AiSqlColumnReferences.extractQualified(sql)) {
            String table = AiSqlAliasMap.resolveTable(ref.tableOrAlias(), aliasToTable);
            Set<String> columns = columnIndex.get(table);
            if (columns == null || columns.isEmpty()) {
                continue;
            }
            String column = ref.column().toLowerCase(Locale.ROOT);
            if (!columns.contains(column)) {
                unknownColumns.add(table + "." + ref.column());
            }
        }

        List<String> unqualified = AiSqlColumnReferences.extractUnqualified(sql, aliasToTable);
        for (String column : unqualified) {
            if (!existsInReferencedTables(column, referencedTables, columnIndex)) {
                unknownColumns.add(column);
            }
        }

        if (unknownColumns.isEmpty()) {
            return SemanticCheckResult.pass();
        }
        return SemanticCheckResult.columnFail(
                "SQL 引用了 DDL 中不存在的列: " + String.join(", ", unknownColumns)
                        + "。请仅使用 CREATE TABLE 片段里出现的列名。"
        );
    }

    private static boolean existsInReferencedTables(
            String column,
            List<String> referencedTables,
            Map<String, Set<String>> columnIndex
    ) {
        String columnLower = column.toLowerCase(Locale.ROOT);
        boolean checkedAny = false;
        for (String table : referencedTables) {
            Set<String> columns = columnIndex.get(table.toLowerCase(Locale.ROOT));
            if (columns == null || columns.isEmpty()) {
                continue;
            }
            checkedAny = true;
            if (columns.contains(columnLower)) {
                return true;
            }
        }
        return !checkedAny;
    }
}
