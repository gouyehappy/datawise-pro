package org.apache.datawise.backend.database.federated;

import org.apache.datawise.backend.database.federated.FederatedJoinSqlParser.FederatedJoinPlan;
import org.apache.datawise.backend.database.federated.FederatedJoinSqlParser.FederatedJoinStep;
import org.apache.datawise.backend.database.sql.SqlService;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.model.FederatedViewSource;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class FederatedJoinExecutorTest {

    @Test
    void innerJoinStopsAtMaxRows() {
        SqlService sqlService = mock(SqlService.class);
        when(sqlService.execute(any(), any(), any(), anyInt(), isNull()))
                .thenReturn(result(
                        List.of(row("a", 10), row("a", 20), row("a", 30)),
                        List.of(column("a"))
                ))
                .thenReturn(result(
                        List.of(row("b", 10), row("b", 20), row("b", 30)),
                        List.of(column("b"))
                ));

        FederatedJoinPlan plan = new FederatedJoinPlan(
                List.of("*"),
                List.of(
                        new FederatedJoinStep("left", "left", "select 1", null),
                        new FederatedJoinStep("right", "right", "select 2", "left.a = right.b")
                )
        );
        Map<String, FederatedViewSource> sources = new LinkedHashMap<>();
        sources.put("left", source("left-conn"));
        sources.put("right", source("right-conn"));

        ExecuteSqlResult joined = FederatedJoinExecutor.execute(
                "select * from left join right on left.a = right.b",
                plan,
                sources,
                sqlService,
                2
        );

        assertEquals(2, joined.rowCount());
        assertEquals(2, joined.rows().size());
        assertEquals(Boolean.TRUE, joined.hasMore());
    }

    @Test
    void crossJoinRejectsOversizedProduct() {
        SqlService sqlService = mock(SqlService.class);
        List<Map<String, Object>> left = new ArrayList<>();
        List<Map<String, Object>> right = new ArrayList<>();
        for (int i = 0; i < 2_000; i++) {
            left.add(row("a", i));
            right.add(row("b", i));
        }
        when(sqlService.execute(any(), any(), any(), anyInt(), isNull()))
                .thenReturn(result(left, List.of(column("a"))))
                .thenReturn(result(right, List.of(column("b"))));

        FederatedJoinPlan plan = new FederatedJoinPlan(
                List.of("*"),
                List.of(
                        new FederatedJoinStep("left", "left", "select 1", null),
                        new FederatedJoinStep("right", "right", "select 2", null)
                )
        );
        Map<String, FederatedViewSource> sources = new LinkedHashMap<>();
        sources.put("left", source("left-conn"));
        sources.put("right", source("right-conn"));

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> FederatedJoinExecutor.execute(
                        "select * from left join right",
                        plan,
                        sources,
                        sqlService,
                        1000
                )
        );
        assertTrue(error.getMessage().contains("cross JOIN product too large"));
    }

    @Test
    void resolveMaxRowsCapsAtHardLimit() {
        assertEquals(FederatedJoinLimits.DEFAULT_MAX_ROWS, FederatedJoinLimits.resolveMaxRows(null));
        assertEquals(FederatedJoinLimits.HARD_MAX_ROWS, FederatedJoinLimits.resolveMaxRows(999_999));
        assertEquals(500, FederatedJoinLimits.resolveMaxRows(500));
    }

    @Test
    void spillHashJoinMatchesInMemoryResults() {
        List<Map<String, Object>> left = new ArrayList<>();
        List<Map<String, Object>> right = new ArrayList<>();
        for (int i = 0; i < 40; i++) {
            left.add(Map.of("left.a", i, "left.v", "L" + i));
            right.add(Map.of("right.b", i, "right.v", "R" + i));
        }
        List<String[]> eqPairs = List.<String[]>of(new String[]{"left.a", "right.b"});

        FederatedJoinExecutor.JoinOutcome memory = FederatedJoinExecutor.hashJoin(
                left, right, eqPairs, 100, Integer.MAX_VALUE
        );
        FederatedJoinExecutor.JoinOutcome spilled = FederatedJoinExecutor.hashJoin(
                left, right, eqPairs, 100, 0
        );

        assertEquals(40, memory.rows().size());
        assertEquals(40, spilled.rows().size());
        assertEquals(false, spilled.truncated());
        assertEquals(memory.rows().get(0).get("left.v"), spilled.rows().get(0).get("left.v"));
        assertEquals(memory.rows().get(0).get("right.v"), spilled.rows().get(0).get("right.v"));
    }

    @Test
    void spillHashJoinHonorsMaxRowsTruncation() {
        List<Map<String, Object>> left = new ArrayList<>();
        List<Map<String, Object>> right = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            left.add(Map.of("left.a", i));
            right.add(Map.of("right.b", i));
        }
        List<String[]> eqPairs = List.<String[]>of(new String[]{"left.a", "right.b"});

        FederatedJoinExecutor.JoinOutcome spilled = FederatedJoinExecutor.hashJoin(
                left, right, eqPairs, 5, 0
        );
        assertEquals(5, spilled.rows().size());
        assertEquals(true, spilled.truncated());
    }

    private static FederatedViewSource source(String connectionId) {
        FederatedViewSource source = new FederatedViewSource();
        source.setConnectionId(connectionId);
        source.setDatabase("shop");
        return source;
    }

    private static ExecuteSqlResult result(List<Map<String, Object>> rows, List<Map<String, Object>> columns) {
        return new ExecuteSqlResult("sql", rows.size(), 1L, columns, rows, null, null, null, null, null, null);
    }

    private static Map<String, Object> row(String key, Object value) {
        return Map.of(key, value);
    }

    private static Map<String, Object> column(String name) {
        return Map.of("name", name, "key", name);
    }
}
