package org.apache.datawise.backend.connector.doris.ddl;

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

class DorisDdlRendererTest {

    private final DorisDdlRenderer renderer = new DorisDdlRenderer();

    @Test
    void supportsOnlyDoris() {
        assertTrue(renderer.supports("doris"));
        assertFalse(renderer.supports("mysql"));
        assertFalse(renderer.supports("starrocks"));
    }

    @Test
    void rendersOlapFriendlyTypes() {
        assertEquals("boolean", renderer.renderPhysicalType(
                new LogicalType(LogicalTypeKind.BOOLEAN, null, null, null, false, null, Map.of())));
        assertEquals("string", renderer.renderPhysicalType(
                new LogicalType(LogicalTypeKind.TEXT, null, null, null, false, null, Map.of())));
        assertEquals("json", renderer.renderPhysicalType(
                new LogicalType(LogicalTypeKind.JSON, null, null, null, false, null, Map.of())));
    }

    @Test
    void quotesIntegerDefaultForDoris() {
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

        String ddl = renderer.renderCreateTable(definition, DdlRenderOptions.forTarget("shop", "doris"));

        assertTrue(ddl.contains("`user_count` int NULL DEFAULT \"0\" COMMENT '用户数量'"));
        assertFalse(ddl.contains("DEFAULT 0 COMMENT"));
        assertTrue(ddl.contains("ENGINE=OLAP"));
        assertTrue(ddl.contains("DISTRIBUTED BY HASH(`user_count`)"));
    }

    @Test
    void keepsCurrentTimestampDefault() {
        TableDefinition definition = new TableDefinition(
                "shop",
                "shop",
                "events",
                List.of(new ColumnDefinition(
                        "updated_at",
                        new LogicalType(LogicalTypeKind.DATETIME, null, null, null, false, "datetime", Map.of()),
                        true,
                        "CURRENT_TIMESTAMP",
                        false,
                        null,
                        1
                )),
                null,
                List.of(),
                List.of(),
                Map.of(),
                null
        );

        String ddl = renderer.renderCreateTable(definition, DdlRenderOptions.forTarget("shop", "doris"));

        assertTrue(ddl.contains("DEFAULT CURRENT_TIMESTAMP"));
    }
}
