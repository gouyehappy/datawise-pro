package org.apache.datawise.backend.common.support;

import java.util.Locale;

public final class ConnectionAccessLevelSupport {

    private ConnectionAccessLevelSupport() {
    }

    public static ConnectionAccessLevel fromStored(String configured) {
        if (configured == null || configured.isBlank()) {
            return ConnectionAccessLevel.DDL;
        }
        return switch (configured.trim().toLowerCase(Locale.ROOT)) {
            case "read", "readonly" -> ConnectionAccessLevel.READONLY;
            case "readwrite", "dml" -> ConnectionAccessLevel.READWRITE;
            case "write", "ddl" -> ConnectionAccessLevel.DDL;
            // Unknown tokens fail closed (least privilege) instead of elevating to DDL.
            default -> ConnectionAccessLevel.READONLY;
        };
    }

    public static String normalizeStored(String configured) {
        ConnectionAccessLevel level = fromStored(configured);
        return switch (level) {
            case READONLY -> "readonly";
            case READWRITE -> "readwrite";
            case DDL -> "ddl";
        };
    }

    public static boolean shouldPersist(String normalized) {
        return "readonly".equals(normalized) || "readwrite".equals(normalized);
    }
}
