package org.apache.datawise.backend.lineage.parser.jsqlparser;

import org.apache.datawise.backend.lineage.model.ColumnLineage;
import org.apache.datawise.backend.lineage.model.FederatedLineageSource;
import org.apache.datawise.backend.lineage.model.LineageParseRequest;
import org.apache.datawise.backend.lineage.model.LineageParseResult;
import org.apache.datawise.backend.lineage.model.LineageResolutionContext;
import org.apache.datawise.backend.lineage.model.ParseStatus;
import org.apache.datawise.backend.lineage.spi.SqlLineageParserRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class FederatedLineageParserTest {

    private JsqlLineageParser jsqlParser;
    private FederatedLineageParser federatedParser;

    @BeforeEach
    void setUp() {
        jsqlParser = new JsqlLineageParser(null);
        SqlLineageParserRegistry registry = mock(SqlLineageParserRegistry.class);
        when(registry.parseWithFallback(any())).thenAnswer(invocation -> jsqlParser.parse(invocation.getArgument(0)));
        federatedParser = new FederatedLineageParser(registry);
    }

    @Test
    void federatedJoinSql() {
        String sql = """
                SELECT o.id, u.name
                FROM (SELECT id, user_id FROM orders) @orders o
                JOIN (SELECT id, name FROM users) @users u ON o.user_id = u.id
                """;
        LineageParseResult result = federatedParser.parse(request(sql, List.of(
                source("orders", "conn-orders"),
                source("users", "conn-users")
        )));

        assertEquals(ParseStatus.COMPLETE, result.status());
        assertFalse(result.columns().isEmpty());
        List<String> outputs = result.columns().stream().map(ColumnLineage::outputColumn).toList();
        assertTrue(outputs.contains("id"));
        assertTrue(outputs.contains("name"));

        ColumnLineage idColumn = result.columns().stream()
                .filter(col -> "id".equals(col.outputColumn()))
                .findFirst()
                .orElseThrow();
        assertEquals(1, idColumn.sources().size());
        assertEquals("orders", idColumn.sources().get(0).table());
        assertEquals("id", idColumn.sources().get(0).column());

        ColumnLineage nameColumn = result.columns().stream()
                .filter(col -> "name".equals(col.outputColumn()))
                .findFirst()
                .orElseThrow();
        assertEquals(1, nameColumn.sources().size());
        assertEquals("users", nameColumn.sources().get(0).table());
        assertEquals("name", nameColumn.sources().get(0).column());
    }

    @Test
    void singleSourceFederatedSql() {
        String sql = """
                SELECT o.id AS order_id
                FROM (SELECT id FROM orders) @orders o
                """;
        LineageParseResult result = federatedParser.parse(request(sql, List.of(source("orders", "conn-orders"))));

        assertEquals(ParseStatus.COMPLETE, result.status());
        assertEquals(1, result.columns().size());
        ColumnLineage column = result.columns().get(0);
        assertEquals("order_id", column.outputColumn());
        assertEquals("orders", column.sources().get(0).table());
    }

    @Test
    void rejectsNonFederatedSql() {
        LineageParseResult result = federatedParser.parse(request("""
                SELECT id FROM orders
                """, List.of()));
        assertEquals(ParseStatus.FAILED, result.status());
    }

    private static FederatedLineageSource source(String alias, String connectionId) {
        return new FederatedLineageSource(alias, connectionId, "shop", "mysql");
    }

    private static LineageParseRequest request(String sql, List<FederatedLineageSource> federatedSources) {
        return new LineageParseRequest(
                sql,
                "mysql",
                "conn-main",
                "shop",
                "shop",
                "federated_preview",
                3,
                Set.of(),
                LineageResolutionContext.empty(),
                federatedSources
        );
    }
}
