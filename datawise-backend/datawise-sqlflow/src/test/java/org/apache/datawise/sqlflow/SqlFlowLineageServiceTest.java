package org.apache.datawise.sqlflow;

import org.apache.datawise.sqlflow.def.ColumnDef;
import org.apache.datawise.sqlflow.def.SchemaDef;
import org.apache.datawise.sqlflow.def.TableDef;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.sqlflow.api.DialectCompatibility;
import org.apache.datawise.sqlflow.api.ParseQuality;
import org.apache.datawise.sqlflow.api.SqlFlowAnalyzeRequest;
import org.apache.datawise.sqlflow.api.SqlFlowLineageEngine;
import org.apache.datawise.sqlflow.api.SqlFlowLineageResult;
import org.apache.datawise.sqlflow.dialect.DefaultSqlFlowDialectRegistry;
import org.apache.datawise.sqlflow.dialect.SqlFlowDialect;
import org.apache.datawise.sqlflow.engine.AstSqlFlowLineageEngine;
import org.apache.datawise.sqlflow.engine.SqlFlowEngines;
import org.apache.datawise.sqlflow.engine.UnavailableSqlFlowLineageEngine;
import org.apache.datawise.sqlflow.engine.gsp.GspSqlFlowLineageEngine;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SqlFlowLineageServiceTest {

    @Test
    void returnsUnavailableWhenGspMissing() {
        SqlFlowLineageService service = SqlFlowLineageServices.builder()
                .engine(UnavailableSqlFlowLineageEngine.INSTANCE)
                .build();

        SqlFlowLineageResult result = service.analyze(new SqlFlowAnalyzeRequest(
                "SELECT id FROM users",
                DbType.MYSQL.id()
        ));

        assertFalse(service.engineAvailable());
        assertEquals(ParseQuality.FAILED, result.quality());
        assertEquals("GSP_JAR_MISSING", result.warnings().get(0).code());
    }

    @Test
    void defaultServiceUsesAstEngine() {
        SqlFlowLineageService service = SqlFlowLineageServices.createDefault();
        assertTrue(service.engineAvailable());
        assertEquals(AstSqlFlowLineageEngine.ENGINE_ID, service.engineId());

        SqlFlowLineageResult result = service.analyze(new SqlFlowAnalyzeRequest(
                "SELECT 1 AS one",
                DbType.TRINO.id()
        ));
        assertEquals(ParseQuality.COMPLETE, result.quality());
        assertEquals("one", result.columns().get(0).outputColumn());
    }

    @Test
    void trinoFamilyDoesNotEmitDialectFallbackWarning() {
        SqlFlowLineageService service = SqlFlowLineageServices.createDefault();
        SqlFlowLineageResult result = service.analyze(new SqlFlowAnalyzeRequest(
                "SELECT id FROM orders",
                DbType.TRINO.id()
        ));
        assertEquals(DialectCompatibility.FULL, result.dialectCompatibility());
        assertTrue(result.warnings().stream().noneMatch(w -> "DIALECT_FALLBACK".equals(w.code())));
    }

    @Test
    void hiveDialectEmitsPartialCompatibilityWarning() {
        SqlFlowLineageService service = SqlFlowLineageServices.createDefault();
        SqlFlowLineageResult result = service.analyze(new SqlFlowAnalyzeRequest(
                "SELECT 1 AS one",
                DbType.HIVE.id()
        ));
        assertEquals(DialectCompatibility.PARTIAL, result.dialectCompatibility());
        assertTrue(result.warnings().stream().anyMatch(w -> "DIALECT_PARTIAL_COMPAT".equals(w.code())));
    }

    @Test
    void mysqlDialectEmitsPartialCompatibilityWarning() {
        SqlFlowLineageService service = SqlFlowLineageServices.createDefault();
        SqlFlowLineageResult result = service.analyze(new SqlFlowAnalyzeRequest(
                "SELECT 1 AS one",
                DbType.MYSQL.id()
        ));
        assertEquals(DialectCompatibility.PARTIAL, result.dialectCompatibility());
        assertTrue(result.warnings().stream().anyMatch(w -> "DIALECT_PARTIAL_COMPAT".equals(w.code())));
    }

    @Test
    void sqlFlowEntrySupportsBareSelectLineage() {
        SqlFlowLineageResult result = SqlFlow.newInstance().analyzeLineage(
                "SELECT 1 AS one",
                DbType.TRINO.id()
        );
        assertEquals(ParseQuality.COMPLETE, result.quality());
        assertEquals("one", result.columns().get(0).outputColumn());
    }

    @Test
    void insertLineageRequiresTargetTableMetadata() {
        SchemaDef schema = new SchemaDef("sales");
        TableDef orders = new TableDef();
        orders.setName("orders");
        orders.setSchema(schema);
        orders.setColumns(List.of(new ColumnDef("id"), new ColumnDef("amount")));

        SqlFlowLineageService service = SqlFlowLineageServices.createDefault();
        SqlFlowLineageResult result = service.analyze(new SqlFlowAnalyzeRequest(
                "INSERT INTO sales.orders SELECT id, amount FROM sales.orders",
                DbType.TRINO.id(),
                List.of(orders)
        ));

        assertEquals(ParseQuality.COMPLETE, result.quality());
        assertEquals(2, result.columns().size());
        assertEquals("id", result.columns().get(0).outputColumn());
    }

    @Test
    void gspEngineReportsMissingJar() {
        GspSqlFlowLineageEngine engine = new GspSqlFlowLineageEngine();
        assertFalse(engine.isAvailable());
        SqlFlowLineageResult result = engine.analyze(new SqlFlowAnalyzeRequest("SELECT 1", DbType.MYSQL.id()));
        assertEquals("GSP_JAR_MISSING", result.warnings().get(0).code());
    }

    @Test
    void astEngineIsPreferredOverGsp() {
        assertEquals(AstSqlFlowLineageEngine.ENGINE_ID, SqlFlowEngines.defaultEngine().engineId());
    }

    @Test
    void runsPreprocessorsBeforeEngine() {
        RecordingEngine engine = new RecordingEngine();
        SqlFlowLineageService service = new SqlFlowLineageService(
                DefaultSqlFlowDialectRegistry.withDefaults(),
                engine,
                java.util.List.of((sql, request) -> sql.trim().toUpperCase())
        );

        service.analyze(new SqlFlowAnalyzeRequest("  select 1 ", DbType.MYSQL.id()));

        assertEquals("SELECT 1", engine.lastSql);
        assertEquals(SqlFlowDialect.MYSQL, engine.lastDialect);
    }

    private static final class RecordingEngine implements SqlFlowLineageEngine {
        private String lastSql;
        private SqlFlowDialect lastDialect;

        @Override
        public String engineId() {
            return "recording";
        }

        @Override
        public String engineVersion() {
            return "test";
        }

        @Override
        public boolean isAvailable() {
            return true;
        }

        @Override
        public SqlFlowLineageResult analyze(SqlFlowAnalyzeRequest request) {
            lastSql = request.sql();
            lastDialect = request.dialect();
            return SqlFlowLineageResult.failed(engineId(), engineVersion(), "TEST", "noop");
        }
    }
}
