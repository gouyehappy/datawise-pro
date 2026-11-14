package org.apache.datawise.backend.migration;

import org.apache.datawise.backend.domain.TableColumnDetail;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TableMigrationPreflightSupportTest {

    @Test
    void compareColumnsDetectsMissingAndExtra() {
        List<TableColumnDetail> source = List.of(
                column("id", "PRI"),
                column("name", null),
                column("created_at", null));
        List<TableColumnDetail> target = List.of(
                column("id", "PRI"),
                column("legacy_code", null));

        TableMigrationPreflightSupport.ColumnCompareResult result =
                TableMigrationPreflightSupport.compareColumns(source, target);

        assertEquals(List.of("created_at", "name"), result.missingOnTarget());
        assertEquals(List.of("legacy_code"), result.extraOnTarget());
        assertTrue(result.typeMismatches().isEmpty());
    }

    @Test
    void compareColumnsDetectsTypeAndNullabilityMismatch() {
        List<TableColumnDetail> source = List.of(
                new TableColumnDetail(1, "id", "INT", false, true, "PRI", null, null, null),
                new TableColumnDetail(2, "name", "VARCHAR(64)", false, false, null, null, null, null)
        );
        List<TableColumnDetail> target = List.of(
                new TableColumnDetail(1, "id", "INT", false, true, "PRI", null, null, null),
                new TableColumnDetail(2, "name", "VARCHAR(32)", true, false, null, null, null, null)
        );

        TableMigrationPreflightSupport.ColumnCompareResult result =
                TableMigrationPreflightSupport.compareColumns(source, target);

        assertEquals(1, result.typeMismatches().size());
        assertTrue(result.typeMismatches().get(0).startsWith("name:"));
        assertTrue(result.typeMismatches().get(0).contains("VARCHAR(64)"));
        assertTrue(result.typeMismatches().get(0).contains("VARCHAR(32)"));
        assertTrue(result.attributeMismatches().isEmpty());
        assertEquals(
                TableMigrationPreflightSupport.STATUS_WARN,
                TableMigrationPreflightSupport.resolveStatus(
                        true, true, List.of(), List.of(), result.typeMismatches()
                ).status()
        );
    }

    @Test
    void compareColumnsDetectsCommentAndDefaultMismatch() {
        List<TableColumnDetail> source = List.of(
                new TableColumnDetail(1, "name", "VARCHAR(64)", true, false, null, "'x'", null, "display")
        );
        List<TableColumnDetail> target = List.of(
                new TableColumnDetail(1, "name", "VARCHAR(64)", true, false, null, "'y'", null, "label")
        );

        TableMigrationPreflightSupport.ColumnCompareResult result =
                TableMigrationPreflightSupport.compareColumns(source, target);

        assertTrue(result.typeMismatches().isEmpty());
        assertEquals(1, result.attributeMismatches().size());
        assertTrue(result.attributeMismatches().get(0).contains("comment"));
        assertTrue(result.attributeMismatches().get(0).contains("default"));
        assertEquals(
                TableMigrationPreflightSupport.STATUS_WARN,
                TableMigrationPreflightSupport.resolveStatus(
                        true, true, List.of(), List.of(), List.of(), result.attributeMismatches()
                ).status()
        );
        assertTrue(TableMigrationPreflightSupport.resolveStatus(
                true, true, List.of(), List.of(), List.of(), result.attributeMismatches()
        ).issues().contains(TableMigrationPreflightSupport.ISSUE_ATTRIBUTE_MISMATCH));
    }

    @Test
    void resolveStatusBlocksWhenColumnsMissingOnTarget() {
        TableMigrationPreflightSupport.StatusResult status = TableMigrationPreflightSupport.resolveStatus(
                true,
                true,
                List.of("name"),
                List.of());

        assertEquals(TableMigrationPreflightSupport.STATUS_BLOCKED, status.status());
        assertTrue(status.issues().contains(TableMigrationPreflightSupport.ISSUE_COLUMNS_MISSING));
    }

    @Test
    void resolveStatusWarnsWhenTargetMissing() {
        TableMigrationPreflightSupport.StatusResult status = TableMigrationPreflightSupport.resolveStatus(
                true,
                false,
                List.of(),
                List.of());

        assertEquals(TableMigrationPreflightSupport.STATUS_WARN, status.status());
        assertTrue(status.issues().contains(TableMigrationPreflightSupport.ISSUE_TARGET_MISSING));
    }

    @Test
    void extractPrimaryKeyColumnsReturnsPriAndPkMarkers() {
        List<TableColumnDetail> columns = List.of(
                column("tenant_id", "PRI"),
                column("order_id", "PK", "bigint"),
                column("name", null, "varchar"));

        List<String> primaryKeys = TableMigrationPreflightSupport.extractPrimaryKeyColumns(columns);

        assertEquals(List.of("tenant_id", "order_id"), primaryKeys);
    }

    @Test
    void suggestWatermarkColumnsPrefersPrimaryKeyAndUpdatedAt() {
        List<TableColumnDetail> columns = List.of(
                column("id", "PRI"),
                column("updated_at", null),
                column("name", null));

        List<String> suggested = TableMigrationPreflightSupport.suggestWatermarkColumns(columns);

        assertEquals(List.of("id", "updated_at"), suggested);
    }

    @Test
    void suggestWatermarkColumnsDetectsTemporalDataType() {
        List<TableColumnDetail> columns = List.of(
                column("id", "PRI", "bigint"),
                column("biz_time", null, "datetime"),
                column("name", null, "varchar"));

        List<String> suggested = TableMigrationPreflightSupport.suggestWatermarkColumns(columns);

        assertEquals(List.of("id", "biz_time"), suggested);
    }

    @Test
    void suggestWatermarkColumnsDetectsCreateTimeByName() {
        List<TableColumnDetail> columns = List.of(
                column("order_id", "PRI", "bigint"),
                column("create_time", null, "varchar"),
                column("status", null, "int"));

        List<String> suggested = TableMigrationPreflightSupport.suggestWatermarkColumns(columns);

        assertEquals(List.of("order_id", "create_time"), suggested);
    }

    private static TableColumnDetail column(String name, String keyType) {
        return column(name, keyType, "varchar");
    }

    private static TableColumnDetail column(String name, String keyType, String dataType) {
        return new TableColumnDetail(1, name, dataType, true, false, keyType, null, null, null);
    }

    @Test
    void summarizeStatusesCountsByStatus() {
        TableMigrationPreflightSupport.PreflightSummary summary =
                TableMigrationPreflightSupport.summarizeStatuses(List.of(
                        TableMigrationPreflightSupport.STATUS_READY,
                        TableMigrationPreflightSupport.STATUS_WARN,
                        TableMigrationPreflightSupport.STATUS_BLOCKED));

        assertEquals(1, summary.readyCount());
        assertEquals(1, summary.warnCount());
        assertEquals(1, summary.blockedCount());
        assertEquals(false, summary.canProceed());
    }
}
