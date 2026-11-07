package org.apache.datawise.backend.ops.spi;

import java.util.Locale;
import java.util.regex.Pattern;

/** 终止会话 / 取消查询 SQL SPI。 */
public interface SessionKillOps {

    String MODE_QUERY = "query";
    String MODE_CONNECTION = "connection";

    Pattern SESSION_ID_PATTERN = Pattern.compile("^\\d+$");

    String dialectId();

    boolean supports(String dbType);

    default int priority() {
        return 100;
    }

    String buildKillSql(String sessionId, String mode);

    static String normalizeMode(String mode) {
        if (mode != null && MODE_CONNECTION.equalsIgnoreCase(mode.trim())) {
            return MODE_CONNECTION;
        }
        return MODE_QUERY;
    }

    static void validateSessionId(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            throw new IllegalArgumentException("sessionId is required");
        }
        String trimmed = sessionId.trim();
        if (!SESSION_ID_PATTERN.matcher(trimmed).matches()) {
            throw new IllegalArgumentException("Invalid sessionId: " + sessionId);
        }
    }
}
