package org.apache.datawise.sqlflow;

import org.apache.datawise.sqlflow.api.SqlFlowAnalyzeRequest;
import org.apache.datawise.sqlflow.api.SqlFlowAnalyzeOptions;
import org.apache.datawise.sqlflow.api.SqlFlowLineageEngine;
import org.apache.datawise.sqlflow.api.SqlFlowLineageResult;
import org.apache.datawise.sqlflow.dialect.SqlFlowDialect;
import org.apache.datawise.sqlflow.dialect.SqlFlowDialectRegistry;
import org.apache.datawise.sqlflow.spi.SqlFlowSqlPreprocessor;
import org.apache.datawise.sqlflow.spi.SqlFlowSqlPreprocessorChain;

import java.util.List;

/** Facade for SQLFlow lineage analysis: dialect resolution, preprocessors, engine dispatch. */
public final class SqlFlowLineageService {

    private final SqlFlowDialectRegistry dialectRegistry;
    private final SqlFlowLineageEngine engine;
    private final SqlFlowSqlPreprocessorChain preprocessorChain;

    public SqlFlowLineageService(
            SqlFlowDialectRegistry dialectRegistry,
            SqlFlowLineageEngine engine,
            List<SqlFlowSqlPreprocessor> preprocessors
    ) {
        this.dialectRegistry = dialectRegistry;
        this.engine = engine;
        this.preprocessorChain = new SqlFlowSqlPreprocessorChain(preprocessors);
    }

    public SqlFlowLineageResult analyze(SqlFlowAnalyzeRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("request is required");
        }
        String sql = request.sql();
        if (sql == null || sql.isBlank()) {
            return SqlFlowLineageResult.failed(
                    engine.engineId(),
                    engine.engineVersion(),
                    "SQL_REQUIRED",
                    "sql is required"
            );
        }

        SqlFlowDialect dialect = request.dialect() != null
                ? request.dialect()
                : dialectRegistry.resolve(request.dbTypeId());

        SqlFlowAnalyzeOptions options = dialectRegistry.optionsFor(request.dbTypeId())
                .apply(request.options(), dialect);

        String preparedSql = preprocessorChain.apply(sql, request);
        SqlFlowAnalyzeRequest prepared = request
                .withSql(preparedSql)
                .withDialect(dialect)
                .withOptions(options);

        return engine.analyze(prepared);
    }

    public boolean engineAvailable() {
        return engine.isAvailable();
    }

    public String engineId() {
        return engine.engineId();
    }
}
