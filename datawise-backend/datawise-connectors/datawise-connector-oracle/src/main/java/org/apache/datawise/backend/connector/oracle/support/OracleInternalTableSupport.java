package org.apache.datawise.backend.connector.oracle.support;

import java.util.Locale;

/** Filters Oracle-internal tables (IOT overflow segments, recycle bin, etc.). */
public final class OracleInternalTableSupport {

    private OracleInternalTableSupport() {
    }

    public static boolean isInternalTable(String tableName) {
        if (tableName == null || tableName.isBlank()) {
            return true;
        }
        String upper = tableName.trim().toUpperCase(Locale.ROOT);
        return upper.startsWith("SYS_IOT_OVER_")
                || upper.startsWith("BIN$");
    }

    /** Extra {@code all_tables} predicates to skip non-user tables. */
    public static String allTablesExcludeClause() {
        return """
                 AND NVL(iot_type, ' ') != 'IOT_OVERFLOW'
                 AND table_name NOT LIKE 'BIN$%'
                """;
    }
}
