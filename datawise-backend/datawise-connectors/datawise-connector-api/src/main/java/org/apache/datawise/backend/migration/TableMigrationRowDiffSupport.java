package org.apache.datawise.backend.migration;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.TableMigrationRowDiffItem;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/**
 * Pure PK-based row diff for migration preview (insert / update / unchanged)
 * and sampled sync SQL rendering.
 */
public final class TableMigrationRowDiffSupport {

    public static final String KIND_INSERT = "insert";
    public static final String KIND_UPDATE = "update";
    public static final String KIND_UNCHANGED = "unchanged";

    private TableMigrationRowDiffSupport() {
    }

    public record RowDiff(String kind, List<String> changedColumns) {
    }

    public static RowDiff compareRows(
                                      Map<String, Object> sourceRow,
                                      Map<String, Object> targetRow,
                                      List<String> primaryKeyColumns,
                                      List<String> compareColumns) {
        if (sourceRow == null || sourceRow.isEmpty()) {
            throw new IllegalArgumentException("sourceRow is required");
        }
        if (primaryKeyColumns == null || primaryKeyColumns.isEmpty()) {
            throw new IllegalArgumentException("primaryKeyColumns are required");
        }
        if (targetRow == null || targetRow.isEmpty()) {
            return new RowDiff(KIND_INSERT, List.of());
        }
        List<String> columns = compareColumns != null && !compareColumns.isEmpty()
                ? compareColumns
                : List.copyOf(sourceRow.keySet());
        List<String> changed = new ArrayList<>();
        for (String column : columns) {
            if (column == null || column.isBlank()) {
                continue;
            }
            if (isPrimaryKey(column, primaryKeyColumns)) {
                continue;
            }
            Object left = lookup(sourceRow, column);
            Object right = lookup(targetRow, column);
            if (!valuesEqual(left, right)) {
                changed.add(column);
            }
        }
        if (changed.isEmpty()) {
            return new RowDiff(KIND_UNCHANGED, List.of());
        }
        return new RowDiff(KIND_UPDATE, List.copyOf(changed));
    }

    public static Map<String, Object> extractPrimaryKey(Map<String, Object> row, List<String> primaryKeyColumns) {
        Map<String, Object> pk = new LinkedHashMap<>();
        if (row == null || primaryKeyColumns == null) {
            return pk;
        }
        for (String column : primaryKeyColumns) {
            if (column == null || column.isBlank()) {
                continue;
            }
            pk.put(column, lookup(row, column));
        }
        return pk;
    }

    public static String primaryKeyFingerprint(Map<String, Object> row, List<String> primaryKeyColumns) {
        StringBuilder sb = new StringBuilder();
        for (String column : primaryKeyColumns) {
            if (sb.length() > 0) {
                sb.append('|');
            }
            Object value = lookup(row, column);
            sb.append(column).append('=').append(value == null ? "<null>" : String.valueOf(value));
        }
        return sb.toString();
    }

    public static int clampSampleLimit(Integer sampleLimit, int defaultLimit, int hardMax) {
        if (sampleLimit == null) {
            return defaultLimit;
        }
        if (sampleLimit < 1) {
            return 1;
        }
        return Math.min(sampleLimit, hardMax);
    }

    /**
     * Render executable INSERT/UPDATE for sampled diffs (preview only; DELETE omitted —
     * sampling is source-driven). Returns null when there is nothing to emit.
     */
    public static String renderSampleSyncSql(
            String targetDbType,
            String targetDatabase,
            String tableName,
            List<String> primaryKeyColumns,
            List<TableMigrationRowDiffItem> samples
    ) {
        if (tableName == null || tableName.isBlank() || samples == null || samples.isEmpty()) {
            return null;
        }
        String qualified = DbType.quoteQualifiedTable(targetDbType, targetDatabase, tableName);
        List<String> statements = new ArrayList<>();
        statements.add("-- Sampled sync SQL (preview only; not a full table sync)");
        for (TableMigrationRowDiffItem sample : samples) {
            if (sample == null || sample.kind() == null) {
                continue;
            }
            if (KIND_INSERT.equals(sample.kind())) {
                String insert = renderInsert(targetDbType, qualified, sample.sourceValues());
                if (insert != null) {
                    statements.add(insert);
                }
            } else if (KIND_UPDATE.equals(sample.kind())) {
                String update = renderUpdate(
                        targetDbType,
                        qualified,
                        primaryKeyColumns,
                        sample.changedColumns(),
                        sample.sourceValues(),
                        sample.primaryKey()
                );
                if (update != null) {
                    statements.add(update);
                }
            }
        }
        if (statements.size() <= 1) {
            return null;
        }
        return String.join("\n", statements) + "\n";
    }

    private static String renderInsert(String dbType, String qualifiedTable, Map<String, Object> values) {
        if (values == null || values.isEmpty()) {
            return null;
        }
        List<String> columns = new ArrayList<>();
        List<String> literals = new ArrayList<>();
        for (Map.Entry<String, Object> entry : values.entrySet()) {
            if (entry.getKey() == null || entry.getKey().isBlank()) {
                continue;
            }
            columns.add(DbType.quoteIdentifier(dbType, entry.getKey()));
            literals.add(formatSqlLiteral(entry.getValue()));
        }
        if (columns.isEmpty()) {
            return null;
        }
        return "INSERT INTO " + qualifiedTable + " (" + String.join(", ", columns) + ") VALUES ("
                + String.join(", ", literals) + ");";
    }

    private static String renderUpdate(
            String dbType,
            String qualifiedTable,
            List<String> primaryKeyColumns,
            List<String> changedColumns,
            Map<String, Object> sourceValues,
            Map<String, Object> primaryKey
    ) {
        if (changedColumns == null || changedColumns.isEmpty() || sourceValues == null) {
            return null;
        }
        List<String> sets = new ArrayList<>();
        for (String column : changedColumns) {
            if (column == null || column.isBlank()) {
                continue;
            }
            Object value = lookup(sourceValues, column);
            sets.add(DbType.quoteIdentifier(dbType, column) + " = " + formatSqlLiteral(value));
        }
        if (sets.isEmpty()) {
            return null;
        }
        List<String> where = new ArrayList<>();
        List<String> pkCols = primaryKeyColumns != null ? primaryKeyColumns : List.of();
        Map<String, Object> pk = primaryKey != null ? primaryKey : Map.of();
        for (String column : pkCols) {
            if (column == null || column.isBlank()) {
                continue;
            }
            Object value = lookup(pk, column);
            if (value == null) {
                value = lookup(sourceValues, column);
            }
            where.add(DbType.quoteIdentifier(dbType, column) + " = " + formatSqlLiteral(value));
        }
        if (where.isEmpty()) {
            return null;
        }
        return "UPDATE " + qualifiedTable + " SET " + String.join(", ", sets)
                + " WHERE " + String.join(" AND ", where) + ";";
    }

    public static String formatSqlLiteral(Object value) {
        if (value == null) {
            return "NULL";
        }
        if (value instanceof Number || value instanceof Boolean) {
            return String.valueOf(value);
        }
        String text = String.valueOf(value);
        return "'" + text.replace("'", "''") + "'";
    }

    private static boolean isPrimaryKey(String column, List<String> primaryKeyColumns) {
        String needle = column.trim().toLowerCase(Locale.ROOT);
        for (String pk : primaryKeyColumns) {
            if (pk != null && pk.trim().toLowerCase(Locale.ROOT).equals(needle)) {
                return true;
            }
        }
        return false;
    }

    private static Object lookup(Map<String, Object> row, String column) {
        if (row.containsKey(column)) {
            return row.get(column);
        }
        String needle = column.toLowerCase(Locale.ROOT);
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            if (entry.getKey() != null && entry.getKey().toLowerCase(Locale.ROOT).equals(needle)) {
                return entry.getValue();
            }
        }
        return null;
    }

    static boolean valuesEqual(Object left, Object right) {
        if (left == null && right == null) {
            return true;
        }
        if (left == null || right == null) {
            return false;
        }
        if (left instanceof Number ln && right instanceof Number rn) {
            return ln.doubleValue() == rn.doubleValue();
        }
        return Objects.equals(String.valueOf(left), String.valueOf(right));
    }
}
