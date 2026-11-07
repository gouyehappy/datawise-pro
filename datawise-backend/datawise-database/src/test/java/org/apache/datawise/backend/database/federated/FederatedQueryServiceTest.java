package org.apache.datawise.backend.database.federated;

import org.apache.datawise.backend.database.federated.FederatedJoinSqlParser.FederatedJoinPlan;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.model.FederatedViewEntry;
import org.apache.datawise.backend.model.FederatedViewSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.apache.datawise.backend.configstore.FederatedViewStore;
import org.apache.datawise.backend.database.sql.SqlService;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.apache.datawise.sqlparser.SqlTransformOps;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class FederatedQueryServiceTest {

    private SqlService sqlService;
    private FederatedQueryService service;

    @BeforeEach
    void setUp() {
        sqlService = mock(SqlService.class);
        service = new FederatedQueryService(
                mock(FederatedViewStore.class),
                sqlService,
                mock(ConnectionVisibilityService.class),
                null
        );
    }

    @Test
    void executeViewJoinsSourcesInMemory() {
        FederatedViewEntry view = new FederatedViewEntry();
        view.setId("fview-1");
        view.setName("orders with users");
        view.setSources(List.of(source("orders"), source("users")));
        view.setSql("SELECT o.id, u.name FROM @orders o JOIN @users u ON o.user_id = u.id");

        when(sqlService.execute(eq(SqlTransformOps.selectAllFrom("orders")), eq("conn-orders"), eq("shop"), eq(100), isNull()))
                .thenReturn(sqlResult(
                        List.of(col("id"), col("user_id")),
                        List.of(row("id", 10, "user_id", 1), row("id", 20, "user_id", 2))
                ));
        when(sqlService.execute(eq(SqlTransformOps.selectAllFrom("users")), eq("conn-users"), eq("shop"), eq(100), isNull()))
                .thenReturn(sqlResult(
                        List.of(col("id"), col("name")),
                        List.of(row("id", 1, "name", "Alice"), row("id", 2, "name", "Bob"))
                ));

        ExecuteSqlResult result = service.executeView(view, 100);

        assertEquals(2, result.rowCount());
        assertEquals(10, result.rows().get(0).get("o.id"));
        assertEquals("Alice", result.rows().get(0).get("u.name"));
        assertEquals(20, result.rows().get(1).get("o.id"));
        assertEquals("Bob", result.rows().get(1).get("u.name"));
    }

    @Test
    void executeViewJoinUsesSubqueriesFromParentheses() {
        FederatedViewEntry view = new FederatedViewEntry();
        view.setSources(List.of(source("orders"), source("users")));
        view.setSql("""
                SELECT o.id, u.name
                FROM (SELECT id, user_id FROM orders WHERE dt >= '2024-01-01') @orders o
                JOIN (SELECT id, name FROM users) @users u ON o.user_id = u.id
                """);

        when(sqlService.execute(
                eq("SELECT id, user_id FROM orders WHERE dt >= '2024-01-01'"),
                eq("conn-orders"),
                eq("shop"),
                eq(50),
                isNull()
        )).thenReturn(sqlResult(
                List.of(col("id"), col("user_id")),
                List.of(row("id", 1, "user_id", 9))
        ));
        when(sqlService.execute(
                eq("SELECT id, name FROM users"),
                eq("conn-users"),
                eq("shop"),
                eq(50),
                isNull()
        )).thenReturn(sqlResult(
                List.of(col("id"), col("name")),
                List.of(row("id", 9, "name", "Carol"))
        ));

        ExecuteSqlResult result = service.executeView(view, 50);

        assertEquals(1, result.rowCount());
        assertEquals(1, result.rows().get(0).get("o.id"));
        assertEquals("Carol", result.rows().get(0).get("u.name"));
    }

    @Test
    void executeViewJoinAppliesSourceOffsetWindow() {
        FederatedViewEntry view = new FederatedViewEntry();
        view.setSources(List.of(source("orders"), source("users")));
        view.setSql("SELECT o.id, u.name FROM @orders o JOIN @users u ON o.user_id = u.id");

        String ordersPaged = FederatedSourceSqlSupport.applySourceWindow(
                SqlTransformOps.selectAllFrom("orders"),
                50,
                100
        );
        String usersPaged = FederatedSourceSqlSupport.applySourceWindow(
                SqlTransformOps.selectAllFrom("users"),
                50,
                100
        );

        when(sqlService.execute(eq(ordersPaged), eq("conn-orders"), eq("shop"), eq(50), isNull()))
                .thenReturn(sqlResult(
                        List.of(col("id"), col("user_id")),
                        List.of(row("id", 10, "user_id", 1))
                ));
        when(sqlService.execute(eq(usersPaged), eq("conn-users"), eq("shop"), eq(50), isNull()))
                .thenReturn(sqlResult(
                        List.of(col("id"), col("name")),
                        List.of(row("id", 1, "name", "Alice"))
                ));

        ExecuteSqlResult result = service.executeView(view, 50, 100);

        assertEquals(1, result.rowCount());
        assertEquals(Integer.valueOf(100), result.pageOffset());
        assertEquals(Integer.valueOf(50), result.pageSize());
    }

    @Test
    void parserReadsJoinPlanFromAiStyleSql() {
        FederatedJoinPlan plan = FederatedJoinSqlParser.parse("""
                SELECT o.id, u.name
                FROM (SELECT id, user_id FROM orders) @orders o
                JOIN (SELECT id, name FROM users) @users u ON o.user_id = u.id
                """);

        assertEquals(List.of("o.id", "u.name"), plan.selectItems());
        assertEquals(2, plan.steps().size());
        assertEquals("orders", plan.steps().get(0).sourceAlias());
        assertEquals("o", plan.steps().get(0).tableAlias());
        assertEquals("SELECT id, user_id FROM orders", plan.steps().get(0).subQuery());
        assertEquals("users", plan.steps().get(1).sourceAlias());
        assertEquals("o.user_id = u.id", plan.steps().get(1).onCondition());
    }

    @Test
    void parserExtractsOuterWhere() {
        FederatedJoinPlan plan = FederatedJoinSqlParser.parse("""
                SELECT o.id, u.name
                FROM (SELECT id, user_id, status FROM orders) @orders o
                JOIN (SELECT id, name, region FROM users) @users u ON o.user_id = u.id
                WHERE o.status = 'active' AND u.region = 'CN'
                """);
        assertEquals("o.status = 'active' AND u.region = 'CN'", plan.outerWhere());
        assertEquals("o.user_id = u.id", plan.steps().get(1).onCondition());
    }

    @Test
    void executeViewPushesSingleAliasWhereIntoSourceSql() {
        FederatedViewEntry view = new FederatedViewEntry();
        view.setSources(List.of(source("orders"), source("users")));
        view.setSql("""
                SELECT o.id, u.name
                FROM (SELECT id, user_id, status FROM orders) @orders o
                JOIN (SELECT id, name FROM users) @users u ON o.user_id = u.id
                WHERE o.status = 'active'
                """);

        when(sqlService.execute(
                org.mockito.ArgumentMatchers.argThat(sql ->
                        sql != null
                                && sql.toUpperCase().contains("STATUS")
                                && sql.toUpperCase().contains("ACTIVE")
                ),
                eq("conn-orders"),
                eq("shop"),
                eq(50),
                isNull()
        )).thenReturn(sqlResult(
                List.of(col("id"), col("user_id"), col("status")),
                List.of(row("id", 1, "user_id", 9, "status", "active"))
        ));
        when(sqlService.execute(
                eq("SELECT id, name FROM users"),
                eq("conn-users"),
                eq("shop"),
                eq(50),
                isNull()
        )).thenReturn(sqlResult(
                List.of(col("id"), col("name")),
                List.of(row("id", 9, "name", "Carol"))
        ));

        ExecuteSqlResult result = service.executeView(view, 50);

        assertEquals(1, result.rowCount());
        assertEquals(1, result.rows().get(0).get("o.id"));
        assertEquals("Carol", result.rows().get(0).get("u.name"));
    }

    @Test
    void subquerySupportHandlesNestedParentheses() {
        String sql = "FROM (SELECT id FROM (SELECT id FROM t) x) @orders o";
        assertEquals("SELECT id FROM (SELECT id FROM t) x", FederatedSqlSubquerySupport.extractSubQuery(sql, "orders"));
    }

    private static FederatedViewSource source(String alias) {
        FederatedViewSource source = new FederatedViewSource();
        source.setAlias(alias);
        source.setConnectionId("conn-" + alias);
        source.setDatabase("shop");
        return source;
    }

    private static Map<String, Object> col(String name) {
        Map<String, Object> column = new LinkedHashMap<>();
        column.put("name", name);
        column.put("key", name);
        return column;
    }

    private static Map<String, Object> row(Object... keyValues) {
        Map<String, Object> row = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            row.put(String.valueOf(keyValues[i]), keyValues[i + 1]);
        }
        return row;
    }

    private static ExecuteSqlResult sqlResult(
            List<Map<String, Object>> columns,
            List<Map<String, Object>> rows
    ) {
        return new ExecuteSqlResult("sql", rows.size(), 1L, columns, rows, null, null, null, null, null, null);
    }
}
