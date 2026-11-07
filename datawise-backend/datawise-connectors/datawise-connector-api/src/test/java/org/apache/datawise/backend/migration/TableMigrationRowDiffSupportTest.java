package org.apache.datawise.backend.migration;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TableMigrationRowDiffSupportTest {

    @Test
    void classifiesInsertWhenTargetMissing() {
        var diff = TableMigrationRowDiffSupport.compareRows(
                Map.of("id", 1, "name", "a"),
                null,
                List.of("id"),
                List.of("id", "name"));
        assertEquals(TableMigrationRowDiffSupport.KIND_INSERT, diff.kind());
        assertTrue(diff.changedColumns().isEmpty());
    }

    @Test
    void classifiesUpdateWhenNonPkDiffers() {
        var diff = TableMigrationRowDiffSupport.compareRows(
                Map.of("id", 1, "name", "a", "qty", 2),
                Map.of("id", 1, "name", "b", "qty", 2),
                List.of("id"),
                List.of("id", "name", "qty"));
        assertEquals(TableMigrationRowDiffSupport.KIND_UPDATE, diff.kind());
        assertEquals(List.of("name"), diff.changedColumns());
    }

    @Test
    void classifiesUnchangedWhenEqual() {
        var diff = TableMigrationRowDiffSupport.compareRows(
                Map.of("id", 1, "name", "a"),
                Map.of("id", 1, "name", "a"),
                List.of("id"),
                List.of("id", "name"));
        assertEquals(TableMigrationRowDiffSupport.KIND_UNCHANGED, diff.kind());
    }

    @Test
    void numberEqualityIsNumeric() {
        var diff = TableMigrationRowDiffSupport.compareRows(
                Map.of("id", 1, "qty", 2),
                Map.of("id", 1L, "qty", 2.0d),
                List.of("id"),
                List.of("id", "qty"));
        assertEquals(TableMigrationRowDiffSupport.KIND_UNCHANGED, diff.kind());
    }
}
