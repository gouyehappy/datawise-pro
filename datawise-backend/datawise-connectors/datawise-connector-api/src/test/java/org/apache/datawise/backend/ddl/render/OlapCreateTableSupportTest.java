package org.apache.datawise.backend.ddl.render;

import org.apache.datawise.backend.ddl.DdlRenderOptions;
import org.apache.datawise.backend.metadata.ColumnDefinition;
import org.apache.datawise.backend.metadata.PrimaryKeyDefinition;
import org.apache.datawise.backend.metadata.ColumnDefinition;
import org.apache.datawise.backend.metadata.LogicalType;
import org.apache.datawise.backend.metadata.LogicalTypeKind;
import org.apache.datawise.backend.metadata.PrimaryKeyDefinition;
import org.apache.datawise.backend.metadata.TableDefinition;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;

class OlapCreateTableSupportTest {

    @Test
    void appendsDuplicateKeyAndDistributedByFromPrimaryKey() {
        TableDefinition definition = new TableDefinition(
                "shop",
                "shop",
                "orders",
                List.of(
                        column("id"),
                        column("status")),
                new PrimaryKeyDefinition("pk_orders", List.of("id")),
                List.of(),
                List.of(),
                Map.of(),
                null);

        StringBuilder sb = new StringBuilder("CREATE TABLE `shop`.`orders` (\n  ...\n)");
        OlapCreateTableSupport.appendOlapTableTail(sb, definition);

        String tail = sb.toString();
        assertTrue(tail.contains("ENGINE=OLAP"));
        assertTrue(tail.contains("DUPLICATE KEY(`id`)"));
        assertTrue(tail.contains("DISTRIBUTED BY HASH(`id`) BUCKETS 10"));
        assertTrue(tail.contains("PROPERTIES (\"replication_num\" = \"1\")"));
    }

    @Test
    void appendsTableCommentAfterDuplicateKey() {
        TableDefinition definition = new TableDefinition(
                "shop",
                "shop",
                "orders",
                List.of(column("id")),
                new PrimaryKeyDefinition("pk_orders", List.of("id")),
                List.of(),
                List.of(),
                Map.of(),
                "订单表");

        StringBuilder sb = new StringBuilder("CREATE TABLE `shop`.`orders` (\n  ...\n)");
        OlapCreateTableSupport.appendOlapTableTail(
                sb,
                definition,
                DdlRenderOptions.forTarget("shop", "starrocks"));

        String tail = sb.toString();
        int engineIndex = tail.indexOf("ENGINE=OLAP");
        int commentIndex = tail.indexOf("COMMENT \"订单表\"");
        int duplicateIndex = tail.indexOf("DUPLICATE KEY");
        assertTrue(engineIndex >= 0);
        assertTrue(commentIndex > duplicateIndex);
        assertTrue(commentIndex > engineIndex);
        assertTrue(!tail.contains(")\nCOMMENT") || tail.indexOf(")\nCOMMENT") > tail.indexOf("CREATE"));
    }

    private static ColumnDefinition column(String name) {
        return new ColumnDefinition(
                name,
                new LogicalType(LogicalTypeKind.BIGINT, null, null, null, false, "bigint", Map.of()),
                true,
                null,
                false,
                null,
                1);
    }
}
