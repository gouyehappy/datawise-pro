package org.apache.datawise.backend.migration;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/**
 * Pure PK-based row diff for migration preview (insert / update / unchanged).
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
