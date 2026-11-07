package org.apache.datawise.backend.migration;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class TableMigrationValidationSupportTest {

    @Test
    void truncateMigrationMatchesWhenTargetEqualsSource() {
        TableMigrationValidationSupport.RowCountValidationResult result =
                TableMigrationValidationSupport.validateRowCounts(true, 100, 100L, 50L, 100L);
        assertEquals(TableMigrationValidationSupport.VALIDATION_MATCH, result.validation());
        assertNull(result.message());
    }

    @Test
    void truncateMigrationMismatchWhenTargetDiffers() {
        TableMigrationValidationSupport.RowCountValidationResult result =
                TableMigrationValidationSupport.validateRowCounts(true, 100, 100L, 0L, 99L);
        assertEquals(TableMigrationValidationSupport.VALIDATION_MISMATCH, result.validation());
    }

    @Test
    void appendMigrationMatchesWhenTargetIncrementsByMigratedRows() {
        TableMigrationValidationSupport.RowCountValidationResult result =
                TableMigrationValidationSupport.validateRowCounts(false, 25, 25L, 10L, 35L);
        assertEquals(TableMigrationValidationSupport.VALIDATION_MATCH, result.validation());
    }

    @Test
    void appendMigrationMismatchWhenTargetDeltaWrong() {
        TableMigrationValidationSupport.RowCountValidationResult result =
                TableMigrationValidationSupport.validateRowCounts(false, 25, 25L, 10L, 30L);
        assertEquals(TableMigrationValidationSupport.VALIDATION_MISMATCH, result.validation());
    }

    @Test
    void skipsWhenCountsUnavailable() {
        TableMigrationValidationSupport.RowCountValidationResult result =
                TableMigrationValidationSupport.validateRowCounts(false, 10, null, 5L, 15L);
        assertEquals(TableMigrationValidationSupport.VALIDATION_SKIPPED, result.validation());
    }
}
