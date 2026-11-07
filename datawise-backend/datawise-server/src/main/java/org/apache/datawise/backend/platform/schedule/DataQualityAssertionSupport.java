package org.apache.datawise.backend.platform.schedule;

import org.apache.datawise.backend.domain.ExecuteSqlResult;

import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Evaluates SQL-based data-quality assertions against an {@link ExecuteSqlResult}.
 * <p>
 * Supported assertions:
 * <ul>
 *   <li>{@code empty_result} — row count must be 0</li>
 *   <li>{@code row_count_eq} / {@code row_count_lte} — compare {@code expected}</li>
 *   <li>{@code scalar_eq} / {@code scalar_lte} — first row / named column vs {@code expected}</li>
 * </ul>
 */
public final class DataQualityAssertionSupport {

    public static final String EMPTY_RESULT = "empty_result";
    public static final String ROW_COUNT_EQ = "row_count_eq";
    public static final String ROW_COUNT_LTE = "row_count_lte";
    public static final String SCALAR_EQ = "scalar_eq";
    public static final String SCALAR_LTE = "scalar_lte";

    private DataQualityAssertionSupport() {
    }

    public static void evaluate(
            ExecuteSqlResult result,
            String assertion,
            String expectedRaw,
            String column
    ) {
        if (result == null) {
            throw new IllegalArgumentException("DQ_NO_RESULT");
        }
        String kind = assertion != null ? assertion.trim().toLowerCase(Locale.ROOT) : EMPTY_RESULT;
        int rowCount = result.rowCount();
        List<Map<String, Object>> rows = result.rows() != null ? result.rows() : List.of();

        switch (kind) {
            case EMPTY_RESULT -> {
                if (rowCount != 0) {
                    fail("expected empty result, got rowCount=" + rowCount);
                }
            }
            case ROW_COUNT_EQ -> {
                long expected = parseLong(expectedRaw, "expected");
                if (rowCount != expected) {
                    fail("expected rowCount=" + expected + ", got " + rowCount);
                }
            }
            case ROW_COUNT_LTE -> {
                long expected = parseLong(expectedRaw, "expected");
                if (rowCount > expected) {
                    fail("expected rowCount<=" + expected + ", got " + rowCount);
                }
            }
            case SCALAR_EQ -> {
                String actual = scalarValue(rows, column);
                String expected = expectedRaw != null ? expectedRaw.trim() : "";
                if (!expected.equals(actual)) {
                    fail("expected scalar=" + expected + ", got " + actual);
                }
            }
            case SCALAR_LTE -> {
                BigDecimal expected = parseDecimal(expectedRaw, "expected");
                BigDecimal actual = parseDecimal(scalarValue(rows, column), "scalar");
                if (actual.compareTo(expected) > 0) {
                    fail("expected scalar<=" + expected + ", got " + actual);
                }
            }
            default -> throw new IllegalArgumentException("unsupported DQ assertion: " + kind);
        }
    }

    private static String scalarValue(List<Map<String, Object>> rows, String column) {
        if (rows.isEmpty()) {
            fail("expected a scalar row, got empty result");
        }
        Map<String, Object> row = rows.get(0);
        if (row == null || row.isEmpty()) {
            fail("expected a scalar row, got empty row");
        }
        if (column != null && !column.isBlank()) {
            Object value = row.get(column.trim());
            if (value == null) {
                // case-insensitive column lookup
                for (Map.Entry<String, Object> entry : row.entrySet()) {
                    if (entry.getKey() != null && entry.getKey().equalsIgnoreCase(column.trim())) {
                        return stringify(entry.getValue());
                    }
                }
                fail("column not found: " + column);
            }
            return stringify(value);
        }
        Object first = row.values().iterator().next();
        return stringify(first);
    }

    private static String stringify(Object value) {
        return value == null ? "" : value.toString().trim();
    }

    private static long parseLong(String raw, String field) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException(field + " is required for assertion");
        }
        try {
            return Long.parseLong(raw.trim());
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException(field + " must be an integer: " + raw);
        }
    }

    private static BigDecimal parseDecimal(String raw, String field) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException(field + " is required for assertion");
        }
        try {
            return new BigDecimal(raw.trim());
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException(field + " must be numeric: " + raw);
        }
    }

    private static void fail(String message) {
        throw new IllegalArgumentException("DQ_ASSERTION_FAILED: " + message);
    }
}
