package org.apache.datawise.backend.migration;

/** 迁移后行数校验（纯逻辑，便于单测）。 */
public final class TableMigrationValidationSupport {

    public static final String VALIDATION_MATCH = "match";
    public static final String VALIDATION_MISMATCH = "mismatch";
    public static final String VALIDATION_SKIPPED = "skipped";

    private TableMigrationValidationSupport() {
    }

    public record RowCountValidationResult(
            String validation,
            String message) {
    }

    public static RowCountValidationResult validateRowCounts(
                                                             boolean truncateTarget,
                                                             int rowsMigrated,
                                                             Long sourceRowCount,
                                                             Long targetRowCountBefore,
                                                             Long targetRowCountAfter) {
        if (sourceRowCount == null || targetRowCountAfter == null) {
            return new RowCountValidationResult(VALIDATION_SKIPPED, null);
        }

        if (rowsMigrated != sourceRowCount) {
            return new RowCountValidationResult(
                    VALIDATION_MISMATCH,
                    "Migrated rows (" + rowsMigrated + ") differ from source filter count (" + sourceRowCount + ")");
        }

        if (truncateTarget) {
            if (targetRowCountAfter.equals(sourceRowCount)) {
                return new RowCountValidationResult(VALIDATION_MATCH, null);
            }
            return new RowCountValidationResult(
                    VALIDATION_MISMATCH,
                    "Target row count (" + targetRowCountAfter + ") differs from source (" + sourceRowCount + ")");
        }

        if (targetRowCountBefore == null) {
            return new RowCountValidationResult(VALIDATION_SKIPPED, null);
        }

        long expectedTarget = targetRowCountBefore + rowsMigrated;
        if (targetRowCountAfter == expectedTarget) {
            return new RowCountValidationResult(VALIDATION_MATCH, null);
        }
        return new RowCountValidationResult(
                VALIDATION_MISMATCH,
                "Target row count (" + targetRowCountAfter + ") differs from expected (" + expectedTarget + ")");
    }
}
