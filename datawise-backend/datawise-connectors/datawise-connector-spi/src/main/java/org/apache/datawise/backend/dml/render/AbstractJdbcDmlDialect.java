package org.apache.datawise.backend.dml.render;

import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.dml.spi.DmlDialect;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * JDBC DML 语句通用拼装；子类只需实现标识符引用与表名限定规则。
 */
public abstract class AbstractJdbcDmlDialect implements DmlDialect {

    @Override
    public String buildInsert(String database, String tableName, Map<String, Object> values) {
        if (values == null || values.isEmpty()) {
            throw new IllegalArgumentException("Insert requires at least one column value");
        }
        String target = qualifiedTable(database, tableName);
        List<String> columns = new ArrayList<>(values.keySet());
        String columnSql = columns.stream()
                .map(this::quoteIdentifier)
                .collect(Collectors.joining(", "));
        String valueSql = columns.stream()
                .map(values::get)
                .map(this::sqlLiteral)
                .collect(Collectors.joining(", "));
        return "INSERT INTO " + target + " (" + columnSql + ") VALUES (" + valueSql + ")";
    }

    @Override
    public String buildMultiInsert(
                                   String database,
                                   String tableName,
                                   List<Map<String, Object>> columns,
                                   List<Map<String, Object>> rows) {
        if (rows == null || rows.isEmpty()) {
            return "";
        }
        if (columns == null || columns.isEmpty()) {
            throw new IllegalArgumentException("Insert requires column metadata");
        }
        List<String> columnNames = new ArrayList<>();
        List<String> columnKeys = new ArrayList<>();
        for (Map<String, Object> column : columns) {
            Object nameObj = column.get("name");
            Object keyObj = column.get("key");
            if (nameObj == null || keyObj == null) {
                continue;
            }
            columnNames.add(String.valueOf(nameObj));
            columnKeys.add(String.valueOf(keyObj));
        }
        if (columnNames.isEmpty()) {
            throw new IllegalArgumentException("Insert requires at least one column");
        }

        String target = qualifiedTable(database, tableName);
        String columnSql = columnNames.stream()
                .map(this::quoteIdentifier)
                .collect(Collectors.joining(", "));

        List<String> tuples = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) {
            String valueSql = columnKeys.stream()
                    .map(key -> sqlLiteral(row.get(key)))
                    .collect(Collectors.joining(", "));
            tuples.add("(" + valueSql + ")");
        }

        return "INSERT INTO " + target + " (" + columnSql + ") VALUES "
                + String.join(", ", tuples);
    }

    /**
     * Shared column/key extraction for multi-row INSERT/UPSERT builders.
     */
    public record MultiRowColumns(List<String> names, List<String> keys) {
    }

    public MultiRowColumns requireMultiRowColumns(List<Map<String, Object>> columns) {
        if (columns == null || columns.isEmpty()) {
            throw new IllegalArgumentException("Insert requires column metadata");
        }
        List<String> columnNames = new ArrayList<>();
        List<String> columnKeys = new ArrayList<>();
        for (Map<String, Object> column : columns) {
            Object nameObj = column.get("name");
            Object keyObj = column.get("key");
            if (nameObj == null || keyObj == null) {
                continue;
            }
            columnNames.add(String.valueOf(nameObj));
            columnKeys.add(String.valueOf(keyObj));
        }
        if (columnNames.isEmpty()) {
            throw new IllegalArgumentException("Insert requires at least one column");
        }
        return new MultiRowColumns(columnNames, columnKeys);
    }

    /**
     * Single-row INSERT with JDBC placeholders for {@code PreparedStatement.addBatch()}.
     */
    public String buildInsertPrepared(String database, String tableName, MultiRowColumns meta) {
        if (meta == null || meta.names().isEmpty()) {
            throw new IllegalArgumentException("Insert requires at least one column");
        }
        String target = qualifiedTable(database, tableName);
        String columnSql = meta.names().stream()
                .map(this::quoteIdentifier)
                .collect(Collectors.joining(", "));
        String placeholders = meta.names().stream()
                .map(ignored -> "?")
                .collect(Collectors.joining(", "));
        return "INSERT INTO " + target + " (" + columnSql + ") VALUES (" + placeholders + ")";
    }

    /**
     * Single-row UPSERT with JDBC placeholders for {@code PreparedStatement.addBatch()}.
     * Returns {@code null} when the dialect does not support prepared upsert.
     */
    public String buildUpsertPrepared(
                                      String database,
                                      String tableName,
                                      MultiRowColumns meta,
                                      List<String> keyColumns,
                                      String conflictStrategy) {
        return null;
    }

    public String buildMultiInsertBody(
                                       String database,
                                       String tableName,
                                       MultiRowColumns meta,
                                       List<Map<String, Object>> rows) {
        String target = qualifiedTable(database, tableName);
        String columnSql = meta.names().stream()
                .map(this::quoteIdentifier)
                .collect(Collectors.joining(", "));
        List<String> tuples = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) {
            String valueSql = meta.keys().stream()
                    .map(key -> sqlLiteral(row.get(key)))
                    .collect(Collectors.joining(", "));
            tuples.add("(" + valueSql + ")");
        }
        return "INSERT INTO " + target + " (" + columnSql + ") VALUES "
                + String.join(", ", tuples);
    }

    @Override
    public String buildTruncateTable(String database, String tableName) {
        return "TRUNCATE TABLE " + qualifiedTable(database, tableName);
    }

    @Override
    public String buildDeleteByPrimaryKey(
                                          String database,
                                          String tableName,
                                          Map<String, Object> primaryKeyValues) {
        if (primaryKeyValues == null || primaryKeyValues.isEmpty()) {
            throw new IllegalArgumentException("Delete requires primary key values");
        }
        String target = qualifiedTable(database, tableName);
        String where = DmlSqlSupport.buildWhereEquals(this::quoteIdentifier, primaryKeyValues, this::sqlLiteral);
        return "DELETE FROM " + target + " WHERE " + where;
    }

    @Override
    public String buildUpdate(
                              String database,
                              String tableName,
                              Map<String, Object> setValues,
                              Map<String, Object> keyValues) {
        if (setValues == null || setValues.isEmpty()) {
            throw new IllegalArgumentException("Update requires at least one column value");
        }
        if (keyValues == null || keyValues.isEmpty()) {
            throw new IllegalArgumentException("Update requires key values");
        }
        String target = qualifiedTable(database, tableName);
        String setClause = setValues.entrySet().stream()
                .map(entry -> quoteIdentifier(entry.getKey()) + " = " + sqlLiteral(entry.getValue()))
                .collect(Collectors.joining(", "));
        return "UPDATE " + target + " SET " + setClause
                + " WHERE " + DmlSqlSupport.buildWhereEquals(this::quoteIdentifier, keyValues, this::sqlLiteral);
    }

    @Override
    public String buildDropTableIfExists(String database, String tableName) {
        return "DROP TABLE IF EXISTS " + qualifiedTable(database, tableName) + ";\n\n";
    }

    @Override
    public String buildInsertsFromTableData(String database, String tableName, TableDataResult data) {
        if (data == null || data.rows() == null || data.rows().isEmpty()) {
            return "";
        }
        List<Map<String, Object>> columns = data.columns();
        if (columns == null || columns.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (Map<String, Object> row : data.rows()) {
            Map<String, Object> values = new LinkedHashMap<>();
            for (Map<String, Object> column : columns) {
                Object nameObj = column.get("name");
                Object keyObj = column.get("key");
                if (nameObj == null || keyObj == null) {
                    continue;
                }
                values.put(String.valueOf(nameObj), row.get(String.valueOf(keyObj)));
            }
            if (values.isEmpty()) {
                continue;
            }
            sb.append(buildInsert(database, tableName, values)).append(";\n");
        }
        return sb.toString();
    }

    /** 带 database 限定的 {@code db.table}；无 database 时仅返回表名。 */
    protected String qualifiedDbTable(String database, String tableName) {
        String safeTable = quoteIdentifier(DmlSqlSupport.sanitizeIdentifier(tableName));
        if (database == null || database.isBlank()) {
            return safeTable;
        }
        String safeDb = quoteIdentifier(DmlSqlSupport.sanitizeIdentifier(database));
        return safeDb + "." + safeTable;
    }

    /** Literal rendering hook — dialects may override binary / exotic types. */
    protected String sqlLiteral(Object value) {
        return DmlSqlSupport.sqlLiteral(value);
    }
}
