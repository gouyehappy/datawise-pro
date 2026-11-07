package org.apache.datawise.backend.lineage.parser.jsqlparser;

import org.apache.datawise.backend.lineage.model.ColumnLineage;
import org.apache.datawise.backend.lineage.model.ExpressionNode;
import org.apache.datawise.backend.lineage.model.LineageParseRequest;
import org.apache.datawise.backend.lineage.model.LineageParseResult;
import org.apache.datawise.backend.lineage.model.LineageResolutionContext;
import org.apache.datawise.backend.lineage.model.ParseStatus;
import org.apache.datawise.backend.lineage.spi.SchemaCatalog;
import org.apache.datawise.backend.lineage.model.SourceRef;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JsqlLineageParserTest {

    private final JsqlLineageParser parser = new JsqlLineageParser(null);

    @Test
    void directColumn() {
        LineageParseResult result = parser.parse(request("""
                SELECT o.id AS order_id
                FROM orders o
                """));
        assertEquals(ParseStatus.COMPLETE, result.status());
        assertEquals(1, result.columns().size());
        ColumnLineage column = result.columns().get(0);
        assertEquals("order_id", column.outputColumn());
        assertEquals(1, column.sources().size());
        assertEquals("id", column.sources().get(0).column());
        assertEquals("orders", column.sources().get(0).table());
    }

    @Test
    void concatTwoColumns() {
        LineageParseResult result = parser.parse(request("""
                SELECT CONCAT(u.first_name, ' ', u.last_name) AS full_name
                FROM users u
                """));
        assertEquals(ParseStatus.COMPLETE, result.status());
        ColumnLineage column = result.columns().get(0);
        assertEquals("full_name", column.outputColumn());
        assertInstanceOf(ExpressionNode.Function.class, column.expressionTree());
        assertEquals(2, column.sources().size());
        assertTrue(column.sources().stream().anyMatch(ref -> "first_name".equals(ref.column())));
        assertTrue(column.sources().stream().anyMatch(ref -> "last_name".equals(ref.column())));
    }

    @Test
    void joinTwoTables() {
        LineageParseResult result = parser.parse(request("""
                SELECT o.id, u.email
                FROM orders o
                JOIN users u ON o.user_id = u.id
                """));
        assertFalse(result.columns().isEmpty());
        List<String> columns = result.columns().stream().map(ColumnLineage::outputColumn).toList();
        assertTrue(columns.contains("id"));
        assertTrue(columns.contains("email"));
    }

    @Test
    void cteQuery() {
        LineageParseResult result = parser.parse(request("""
                WITH order_ids AS (
                    SELECT id FROM orders
                )
                SELECT order_id
                FROM (
                    SELECT id AS order_id FROM order_ids
                ) t
                """));
        assertEquals(ParseStatus.COMPLETE, result.status());
        ColumnLineage column = result.columns().get(0);
        assertEquals("order_id", column.outputColumn());
        assertEquals(1, column.sources().size());
        assertEquals("id", column.sources().get(0).column());
        assertEquals("orders", column.sources().get(0).table());
    }

    @Test
    void subqueryInFrom() {
        LineageParseResult result = parser.parse(request("""
                SELECT s.order_id
                FROM (
                    SELECT id AS order_id FROM orders
                ) s
                """));
        assertEquals(ParseStatus.COMPLETE, result.status());
        ColumnLineage column = result.columns().get(0);
        assertEquals("order_id", column.outputColumn());
        assertEquals(1, column.sources().size());
        assertEquals("orders", column.sources().get(0).table());
    }

    @Test
    void unionAll() {
        LineageParseResult result = parser.parse(request("""
                SELECT id FROM orders
                UNION ALL
                SELECT id FROM archived_orders
                """));
        assertFalse(result.columns().isEmpty());
        ColumnLineage column = result.columns().get(0);
        assertEquals("id", column.outputColumn());
        assertEquals(2, column.sources().size());
        assertTrue(column.sources().stream().anyMatch(ref -> "orders".equals(ref.table())));
        assertTrue(column.sources().stream().anyMatch(ref -> "archived_orders".equals(ref.table())));
    }

    @Test
    void selectStarWithSchema() {
        SchemaCatalog schema = (schemaName, table) -> {
            if ("orders".equalsIgnoreCase(table)) {
                return List.of("id", "amount");
            }
            return List.of();
        };
        LineageParseResult result = parser.parse(request("""
                SELECT *
                FROM orders
                """, new LineageResolutionContext(schema, Map.of())));
        assertEquals(ParseStatus.COMPLETE, result.status());
        assertEquals(2, result.columns().size());
        List<String> outputs = result.columns().stream().map(ColumnLineage::outputColumn).toList();
        assertTrue(outputs.contains("id"));
        assertTrue(outputs.contains("amount"));
    }

    @Test
    void windowFunction() {
        LineageParseResult result = parser.parse(request("""
                SELECT ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) AS row_num
                FROM orders
                """));
        assertEquals(ParseStatus.COMPLETE, result.status());
        ColumnLineage column = result.columns().get(0);
        assertEquals("row_num", column.outputColumn());
        assertEquals(2, column.sources().size());
        assertTrue(column.sources().stream().anyMatch(ref -> "user_id".equals(ref.column())));
        assertTrue(column.sources().stream().anyMatch(ref -> "created_at".equals(ref.column())));
    }

    private static LineageParseRequest request(String sql) {
        return request(sql, LineageResolutionContext.empty());
    }

    private static LineageParseRequest request(String sql, LineageResolutionContext resolution) {
        return new LineageParseRequest(
                sql,
                "mysql",
                "conn-1",
                "demo",
                "demo",
                "orders_summary",
                3,
                java.util.Set.of(),
                resolution
        );
    }
}
