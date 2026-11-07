package org.apache.datawise.backend.lineage.parser.lakehouse;

import org.apache.datawise.backend.domain.LineageDialectCompatibility;
import org.apache.datawise.backend.lineage.model.ColumnLineage;
import org.apache.datawise.backend.lineage.model.LineageParseRequest;
import org.apache.datawise.backend.lineage.model.LineageParseResult;
import org.apache.datawise.backend.lineage.model.ParseStatus;
import org.apache.datawise.backend.lineage.model.SourceKind;
import org.apache.datawise.backend.lineage.model.SourceRef;
import org.apache.datawise.backend.lineage.parser.sqlflow.SqlFlowAstLineageParser;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class LakehouseLineageParserTest {

    @Test
    void normalizesDistributeByAndReturnsPartialForHive() {
        SqlFlowAstLineageParser ast = mock(SqlFlowAstLineageParser.class);
        when(ast.parse(any())).thenAnswer(invocation -> {
            LineageParseRequest req = invocation.getArgument(0);
            assertFalse(req.sql().toUpperCase().contains("DISTRIBUTE BY"));
            return new LineageParseResult(
                    List.of(),
                    List.of(),
                    ParseStatus.COMPLETE,
                    "sqlflow-ast",
                    "ast",
                    LineageDialectCompatibility.PARTIAL
            );
        });

        LakehouseLineageParser parser = new LakehouseLineageParser(ast);
        LineageParseResult result = parser.parse(request(
                "hive",
                "SELECT id FROM orders DISTRIBUTE BY id"
        ));

        assertEquals(ParseStatus.PARTIAL, result.status());
        assertEquals(LineageDialectCompatibility.PARTIAL, result.dialectCompatibility());
        assertTrue(result.warnings().stream().anyMatch(w -> "LAKEHOUSE_NORMALIZED".equals(w.code())));
        assertTrue(result.warnings().stream().anyMatch(w -> "LAKEHOUSE_PARTIAL_COMPAT".equals(w.code())));
    }

    @Test
    void softensLateralViewAndDelegatesColumnLineage() {
        SqlFlowAstLineageParser ast = mock(SqlFlowAstLineageParser.class);
        when(ast.parse(any())).thenAnswer(invocation -> {
            LineageParseRequest req = invocation.getArgument(0);
            assertFalse(req.sql().toUpperCase().contains("LATERAL VIEW"));
            assertTrue(req.sql().toUpperCase().contains("FROM SRC"));
            return new LineageParseResult(
                    List.of(new ColumnLineage(
                            "id",
                            List.of(new SourceRef("c1", "demo", null, "src", "id", null, SourceKind.PHYSICAL_TABLE)),
                            null
                    )),
                    List.of(),
                    ParseStatus.COMPLETE,
                    "sqlflow-ast",
                    "ast",
                    LineageDialectCompatibility.PARTIAL
            );
        });

        LakehouseLineageParser parser = new LakehouseLineageParser(ast);
        LineageParseResult result = parser.parse(request(
                "hive",
                "SELECT id FROM src LATERAL VIEW explode(arr) t AS x"
        ));

        assertEquals(ParseStatus.PARTIAL, result.status());
        assertEquals(1, result.columns().size());
        assertEquals("id", result.columns().get(0).outputColumn());
        assertTrue(result.warnings().stream().anyMatch(w -> "LAKEHOUSE_LATERAL_VIEW".equals(w.code())));
        assertTrue(result.warnings().stream().anyMatch(w -> "LAKEHOUSE_SOFTENED".equals(w.code())));
    }

    @Test
    void hardFeaturesFallBackToTableLevelWhenAstUnavailable() {
        SqlFlowAstLineageParser ast = mock(SqlFlowAstLineageParser.class);
        when(ast.parse(any())).thenReturn(LineageParseResult.failed(
                "sqlflow-ast",
                "ast",
                LineageDialectCompatibility.PARTIAL,
                "boom"
        ));

        LakehouseLineageParser parser = new LakehouseLineageParser(ast);
        LineageParseResult result = parser.parse(request(
                "hive",
                "SELECT * FROM src LATERAL VIEW explode(arr) t AS x"
        ));

        assertEquals(ParseStatus.PARTIAL, result.status());
        assertEquals(1, result.columns().size());
        assertEquals("_table_deps", result.columns().get(0).outputColumn());
        assertEquals("src", result.columns().get(0).sources().get(0).table());
        assertEquals("*", result.columns().get(0).sources().get(0).column());
        assertTrue(result.warnings().stream().anyMatch(w -> "LAKEHOUSE_TABLE_LEVEL_ONLY".equals(w.code())));
    }

    @Test
    void flinkWindowTvfFallsBackToInnerTable() {
        SqlFlowAstLineageParser ast = mock(SqlFlowAstLineageParser.class);
        when(ast.parse(any())).thenReturn(LineageParseResult.failed(
                "sqlflow-ast",
                "ast",
                LineageDialectCompatibility.PARTIAL,
                "boom"
        ));

        LakehouseLineageParser parser = new LakehouseLineageParser(ast);
        LineageParseResult result = parser.parse(request(
                "flink",
                "SELECT * FROM TABLE(TUMBLE(TABLE orders, DESCRIPTOR(ts), INTERVAL '1' HOUR))"
        ));

        assertEquals(ParseStatus.PARTIAL, result.status());
        assertTrue(result.columns().stream()
                .flatMap(c -> c.sources().stream())
                .anyMatch(s -> "orders".equals(s.table())));
        assertTrue(result.warnings().stream().anyMatch(w -> "LAKEHOUSE_WINDOW_TVF".equals(w.code())));
    }

    @Test
    void trinoRemainsCompleteWhenParseSucceeds() {
        SqlFlowAstLineageParser ast = mock(SqlFlowAstLineageParser.class);
        when(ast.parse(any())).thenReturn(new LineageParseResult(
                List.of(),
                List.of(),
                ParseStatus.COMPLETE,
                "sqlflow-ast",
                "ast",
                LineageDialectCompatibility.FULL
        ));

        LakehouseLineageParser parser = new LakehouseLineageParser(ast);
        LineageParseResult result = parser.parse(request("trino", "SELECT id FROM orders"));

        assertEquals(ParseStatus.COMPLETE, result.status());
        assertEquals(LineageDialectCompatibility.FULL, result.dialectCompatibility());
    }

    @Test
    void supportsSparkAlias() {
        assertTrue(LakehouseSqlSupport.isLakehouseDialect("spark"));
        assertTrue(new LakehouseLineageParser(mock(SqlFlowAstLineageParser.class)).supports("spark"));
    }

    @Test
    void softensAndNormalizesInsertPartition() {
        LakehouseSqlSupport.SoftenResult soften = LakehouseSqlSupport.softenHardFeatures(
                "SELECT a FROM t LATERAL VIEW explode(x) e AS y WHERE a > 1"
        );
        assertTrue(soften.changed());
        assertFalse(soften.sql().toUpperCase().contains("LATERAL VIEW"));

        var normalized = LakehouseSqlSupport.normalizeForLineage(
                "INSERT OVERWRITE TABLE dest PARTITION (dt='2024-01-01') SELECT id FROM src"
        );
        assertTrue(normalized.strippedClauses().contains("INSERT_PARTITION"));
        assertTrue(normalized.strippedClauses().contains("INSERT_OVERWRITE"));
        assertFalse(normalized.sql().toUpperCase().contains("PARTITION"));
        assertTrue(normalized.sql().toUpperCase().startsWith("INSERT INTO"));
    }

    private static LineageParseRequest request(String dbType, String sql) {
        return new LineageParseRequest(sql, dbType, "c1", "demo", "demo", "m1", 3, Set.of());
    }
}
