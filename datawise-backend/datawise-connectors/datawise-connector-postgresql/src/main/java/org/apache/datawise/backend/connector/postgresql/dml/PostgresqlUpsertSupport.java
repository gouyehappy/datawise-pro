package org.apache.datawise.backend.connector.postgresql.dml;

import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** Shared PostgreSQL upsert SQL for family + fork dialects. */
final class PostgresqlUpsertSupport {

    private PostgresqlUpsertSupport() {
    }

    static String build(
            AbstractJdbcDmlDialect dialect,
            String database,
            String tableName,
            List<Map<String, Object>> columns,
            List<Map<String, Object>> rows,
            List<String> keyColumns,
            String conflictStrategy
    ) {
        if (rows == null || rows.isEmpty()) {
            return "";
        }
        String strategy = conflictStrategy == null || conflictStrategy.isBlank()
                ? "OVERWRITE"
                : conflictStrategy.trim().toUpperCase(Locale.ROOT);
        AbstractJdbcDmlDialect.MultiRowColumns meta = dialect.requireMultiRowColumns(columns);
        String insertBody = dialect.buildMultiInsertBody(database, tableName, meta, rows);
        if ("FAIL".equals(strategy)) {
            return insertBody;
        }
        List<String> keys = normalizeKeys(keyColumns);
        if (keys.isEmpty()) {
            throw new IllegalArgumentException("keyColumns are required for PostgreSQL upsert");
        }
        String conflictTarget = keys.stream()
                .map(dialect::quoteIdentifier)
                .collect(Collectors.joining(", "));
        if ("SKIP".equals(strategy)) {
            return insertBody + " ON CONFLICT (" + conflictTarget + ") DO NOTHING";
        }
        if (!"OVERWRITE".equals(strategy)) {
            throw new IllegalArgumentException("unsupported conflictStrategy: " + conflictStrategy);
        }
        Set<String> keySet = keys.stream()
                .map(k -> k.toLowerCase(Locale.ROOT))
                .collect(Collectors.toCollection(LinkedHashSet::new));
        List<String> updateCols = new ArrayList<>();
        for (String name : meta.names()) {
            if (!keySet.contains(name.toLowerCase(Locale.ROOT))) {
                updateCols.add(name);
            }
        }
        if (updateCols.isEmpty()) {
            return insertBody + " ON CONFLICT (" + conflictTarget + ") DO NOTHING";
        }
        String updates = updateCols.stream()
                .map(col -> dialect.quoteIdentifier(col) + " = EXCLUDED." + dialect.quoteIdentifier(col))
                .collect(Collectors.joining(", "));
        return insertBody + " ON CONFLICT (" + conflictTarget + ") DO UPDATE SET " + updates;
    }

    static String buildPrepared(
            AbstractJdbcDmlDialect dialect,
            String database,
            String tableName,
            AbstractJdbcDmlDialect.MultiRowColumns meta,
            List<String> keyColumns,
            String conflictStrategy
    ) {
        String strategy = conflictStrategy == null || conflictStrategy.isBlank()
                ? "OVERWRITE"
                : conflictStrategy.trim().toUpperCase(Locale.ROOT);
        String insertBody = dialect.buildInsertPrepared(database, tableName, meta);
        if ("FAIL".equals(strategy)) {
            return insertBody;
        }
        List<String> keys = normalizeKeys(keyColumns);
        if (keys.isEmpty()) {
            throw new IllegalArgumentException("keyColumns are required for PostgreSQL upsert");
        }
        String conflictTarget = keys.stream()
                .map(dialect::quoteIdentifier)
                .collect(Collectors.joining(", "));
        if ("SKIP".equals(strategy)) {
            return insertBody + " ON CONFLICT (" + conflictTarget + ") DO NOTHING";
        }
        if (!"OVERWRITE".equals(strategy)) {
            throw new IllegalArgumentException("unsupported conflictStrategy: " + conflictStrategy);
        }
        Set<String> keySet = keys.stream()
                .map(k -> k.toLowerCase(Locale.ROOT))
                .collect(Collectors.toCollection(LinkedHashSet::new));
        List<String> updateCols = new ArrayList<>();
        for (String name : meta.names()) {
            if (!keySet.contains(name.toLowerCase(Locale.ROOT))) {
                updateCols.add(name);
            }
        }
        if (updateCols.isEmpty()) {
            return insertBody + " ON CONFLICT (" + conflictTarget + ") DO NOTHING";
        }
        String updates = updateCols.stream()
                .map(col -> dialect.quoteIdentifier(col) + " = EXCLUDED." + dialect.quoteIdentifier(col))
                .collect(Collectors.joining(", "));
        return insertBody + " ON CONFLICT (" + conflictTarget + ") DO UPDATE SET " + updates;
    }

    private static List<String> normalizeKeys(List<String> keyColumns) {
        List<String> keys = new ArrayList<>();
        if (keyColumns != null) {
            for (String key : keyColumns) {
                if (key != null && !key.isBlank()) {
                    keys.add(key.trim());
                }
            }
        }
        return keys;
    }
}
