package org.apache.datawise.backend.connector.starrocks.ddl;

import org.apache.datawise.backend.ddl.DdlRenderOptions;
import org.apache.datawise.backend.metadata.ColumnDefinition;
import org.apache.datawise.backend.metadata.LogicalType;
import org.apache.datawise.backend.metadata.LogicalTypeKind;
import org.apache.datawise.backend.metadata.PrimaryKeyDefinition;
import org.apache.datawise.backend.metadata.TableDefinition;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class StarRocksDdlRendererTest {

    private final StarRocksDdlRenderer renderer = new StarRocksDdlRenderer();

    @Test
    void supportsOnlyStarRocks() {
        assertTrue(renderer.supports("starrocks"));
        assertFalse(renderer.supports("mysql"));
        assertFalse(renderer.supports("doris"));
    }

    @Test
    void rendersOlapFriendlyTypes() {
        assertEquals("boolean", renderer.renderPhysicalType(
                new LogicalType(LogicalTypeKind.BOOLEAN, null, null, null, false, null, Map.of())));
        assertEquals("varchar(65533)", renderer.renderPhysicalType(
                new LogicalType(LogicalTypeKind.TEXT, null, null, null, false, null, Map.of())));
    }

    @Test
    void quotesIntegerDefaultForStarRocks() {
        TableDefinition definition = new TableDefinition(
                "shop",
                "shop",
                "users",
                List.of(new ColumnDefinition(
                        "user_count",
                        new LogicalType(LogicalTypeKind.INTEGER, null, null, null, false, "int", Map.of()),
                        true,
                        "0",
                        false,
                        "用户数量",
                        1
                )),
                new PrimaryKeyDefinition("pk_users", List.of("user_count")),
                List.of(),
                List.of(),
                Map.of(),
                null
        );

        String ddl = renderer.renderCreateTable(definition, DdlRenderOptions.forTarget("shop", "starrocks"));

        assertTrue(ddl.contains("`user_count` int DEFAULT '0' COMMENT '用户数量'"));
        assertFalse(ddl.contains("DEFAULT 0 COMMENT"));
    }

    @Test
    void rendersOlapCreateTableTail() {
        TableDefinition definition = new TableDefinition(
                "shop",
                "shop",
                "orders",
                List.of(new ColumnDefinition(
                        "id",
                        new LogicalType(LogicalTypeKind.BIGINT, null, null, null, false, "bigint", Map.of()),
                        false,
                        null,
                        true,
                        null,
                        1
                )),
                new PrimaryKeyDefinition("pk_orders", List.of("id")),
                List.of(),
                List.of(),
                Map.of(),
                null
        );

        String ddl = renderer.renderCreateTable(definition, DdlRenderOptions.forTarget("shop", "starrocks"));

        assertTrue(ddl.contains("ENGINE=OLAP"));
        assertTrue(ddl.contains("DUPLICATE KEY(`id`)"));
        assertTrue(ddl.contains("DISTRIBUTED BY HASH(`id`) BUCKETS 10"));
        assertTrue(ddl.contains("AUTO_INCREMENT"));
    }
}
