package org.apache.datawise.backend.jdbc.support;

/**
 * Redacts secrets embedded in JDBC URLs before they reach clients or logs (DB-03 / DB-04).
 */
public final class JdbcUrlRedactor {

    private JdbcUrlRedactor() {
    }

    /**
     * Returns a log/client-safe form of {@code jdbcUrl}: password-like query/props and
     * {@code user:password@} credentials become {@code ***}. Blank/null → empty string.
     */
    public static String redactJdbcUrl(String jdbcUrl) {
        if (jdbcUrl == null || jdbcUrl.isBlank()) {
            return "";
        }
        String redacted = jdbcUrl.trim();
        // user:password@host
        redacted = redacted.replaceAll("(?i)(://[^:/?@\\s]+):([^@/\\s]+)@", "$1:***@");
        // password=… / trustStorePassword=… / keyStorePassword=… / sslpassword=… / pwd=… / pass=…
        redacted = redacted.replaceAll(
                "(?i)((?:password|pwd|pass|truststorepassword|keystorepassword|sslpassword)\\s*=\\s*)[^;&]*",
                "$1***");
        return redacted;
    }
}
