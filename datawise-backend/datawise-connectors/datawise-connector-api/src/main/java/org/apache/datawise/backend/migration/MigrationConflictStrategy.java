package org.apache.datawise.backend.migration;

/** Conflict handling for {@code PK_UPSERT} table migration. */
public final class MigrationConflictStrategy {

    public static final String OVERWRITE = "OVERWRITE";
    public static final String SKIP = "SKIP";
    public static final String FAIL = "FAIL";

    private MigrationConflictStrategy() {
    }

    public static String normalize(String value) {
        if (value == null || value.isBlank()) {
            return OVERWRITE;
        }
        String normalized = value.trim().toUpperCase();
        return switch (normalized) {
            case OVERWRITE, SKIP, FAIL -> normalized;
            default -> throw new IllegalArgumentException("unsupported conflictStrategy: " + value);
        };
    }

    public static boolean isUpsertMode(String mode) {
        return mode != null && "PK_UPSERT".equalsIgnoreCase(mode.trim());
    }
}
