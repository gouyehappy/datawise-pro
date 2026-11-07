package org.apache.datawise.backend.database.sql;

/** Guards against oversized SQL payloads from API/console callers. */
public final class SqlPayloadLimits {

    public static final int MAX_SQL_CHARS = 1_048_576;

    private SqlPayloadLimits() {
    }

    public static void requireWithinLimit(String sql) {
        if (sql == null) {
            return;
        }
        if (sql.length() > MAX_SQL_CHARS) {
            throw new IllegalArgumentException("SQL exceeds maximum length of " + MAX_SQL_CHARS + " characters");
        }
    }
}
