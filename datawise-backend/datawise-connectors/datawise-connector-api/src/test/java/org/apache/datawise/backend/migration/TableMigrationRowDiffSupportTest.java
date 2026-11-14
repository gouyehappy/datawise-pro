package org.apache.datawise.backend.migration;

import org.apache.datawise.backend.domain.TableMigrationRowDiffItem;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
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

    @Test
    void rendersInsertAndUpdateSyncSql() {
        List<TableMigrationRowDiffItem> samples = List.of(
                new TableMigrationRowDiffItem(
                        TableMigrationRowDiffSupport.KIND_INSERT,
                        Map.of("id", 1),
                        List.of(),
                        Map.of("id", 1, "name", "a"),
                        null
                ),
                new TableMigrationRowDiffItem(
                        TableMigrationRowDiffSupport.KIND_UPDATE,
                        Map.of("id", 2),
                        List.of("name"),
                        Map.of("id", 2, "name", "b"),
                        Map.of("id", 2, "name", "old")
                )
        );
        String sql = TableMigrationRowDiffSupport.renderSampleSyncSql(
                "mysql",
                "shop",
                "users",
                List.of("id"),
                samples
        );
        assertTrue(sql.contains("INSERT INTO `shop`.`users`"));
        assertTrue(sql.contains("`name`"));
        assertTrue(sql.contains("UPDATE `shop`.`users` SET `name` = 'b' WHERE `id` = 2;"));
    }

    @Test
    void renderSyncSqlReturnsNullWhenNoSamples() {
        assertNull(TableMigrationRowDiffSupport.renderSampleSyncSql(
                "mysql", "shop", "users", List.of("id"), List.of()
        ));
    }
}
