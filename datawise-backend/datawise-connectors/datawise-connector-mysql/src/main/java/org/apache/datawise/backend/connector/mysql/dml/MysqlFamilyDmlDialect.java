package org.apache.datawise.backend.connector.mysql.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** MySQL 协议族 DML（mysql / mariadb / doris / starrocks / oceanbase / tidb 等）。 */
public final class MysqlFamilyDmlDialect extends AbstractJdbcDmlDialect {

    @Override
    public String dialectId() {
        return "mysql-family";
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.isMysqlProtocol(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public String quoteIdentifier(String name) {
        return DbType.MYSQL.quoteName(DmlSqlSupport.sanitizeIdentifier(name));
    }

    @Override
    public String qualifiedTable(String database, String tableName) {
        return DbType.quoteQualifiedTable(DbType.MYSQL.id(), database, tableName);
    }

    @Override
    public String buildMultiUpsert(
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
        MultiRowColumns meta = requireMultiRowColumns(columns);
        String insertBody = buildMultiInsertBody(database, tableName, meta, rows);
        if ("FAIL".equals(strategy)) {
            return insertBody;
        }
        if ("SKIP".equals(strategy)) {
            return insertBody.replaceFirst("^INSERT INTO ", "INSERT IGNORE INTO ");
        }
        if (!"OVERWRITE".equals(strategy)) {
            throw new IllegalArgumentException("unsupported conflictStrategy: " + conflictStrategy);
        }
        Set<String> keySet = normalizeKeySet(keyColumns);
        List<String> updateCols = new ArrayList<>();
        for (String name : meta.names()) {
            if (!keySet.contains(name.toLowerCase(Locale.ROOT))) {
                updateCols.add(name);
            }
        }
        if (updateCols.isEmpty()) {
            // PK-only rows: treat as skip-on-duplicate
            return insertBody.replaceFirst("^INSERT INTO ", "INSERT IGNORE INTO ");
        }
        String updates = updateCols.stream()
                .map(col -> quoteIdentifier(col) + " = VALUES(" + quoteIdentifier(col) + ")")
                .collect(Collectors.joining(", "));
        return insertBody + " ON DUPLICATE KEY UPDATE " + updates;
    }

    @Override
    public String buildUpsertPrepared(
            String database,
            String tableName,
            MultiRowColumns meta,
            List<String> keyColumns,
            String conflictStrategy
    ) {
        String strategy = conflictStrategy == null || conflictStrategy.isBlank()
                ? "OVERWRITE"
                : conflictStrategy.trim().toUpperCase(Locale.ROOT);
        String insertBody = buildInsertPrepared(database, tableName, meta);
        if ("FAIL".equals(strategy)) {
            return insertBody;
        }
        if ("SKIP".equals(strategy)) {
            return insertBody.replaceFirst("^INSERT INTO ", "INSERT IGNORE INTO ");
        }
        if (!"OVERWRITE".equals(strategy)) {
            throw new IllegalArgumentException("unsupported conflictStrategy: " + conflictStrategy);
        }
        Set<String> keySet = normalizeKeySet(keyColumns);
        List<String> updateCols = new ArrayList<>();
        for (String name : meta.names()) {
            if (!keySet.contains(name.toLowerCase(Locale.ROOT))) {
                updateCols.add(name);
            }
        }
        if (updateCols.isEmpty()) {
            return insertBody.replaceFirst("^INSERT INTO ", "INSERT IGNORE INTO ");
        }
        String updates = updateCols.stream()
                .map(col -> quoteIdentifier(col) + " = VALUES(" + quoteIdentifier(col) + ")")
                .collect(Collectors.joining(", "));
        return insertBody + " ON DUPLICATE KEY UPDATE " + updates;
    }

    private static Set<String> normalizeKeySet(List<String> keyColumns) {
        LinkedHashSet<String> keys = new LinkedHashSet<>();
        if (keyColumns != null) {
            for (String key : keyColumns) {
                if (key != null && !key.isBlank()) {
                    keys.add(key.trim().toLowerCase(Locale.ROOT));
                }
            }
        }
        return keys;
    }
}
