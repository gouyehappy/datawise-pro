package org.apache.datawise.sqlflow.engine;

import org.apache.datawise.sqlflow.analyzer.Analysis;
import org.apache.datawise.sqlflow.analyzer.Scope;
import org.apache.datawise.sqlflow.analyzer.StatementAnalyzer;
import org.apache.datawise.sqlflow.api.DialectCompatibility;
import org.apache.datawise.sqlflow.api.SqlFlowAnalyzeRequest;
import org.apache.datawise.sqlflow.api.SqlFlowLineageEngine;
import org.apache.datawise.sqlflow.api.SqlFlowLineageResult;
import org.apache.datawise.sqlflow.dialect.SqlFlowDialect;
import org.apache.datawise.sqlflow.metadata.DefaultMetadataService;
import org.apache.datawise.sqlflow.metadata.SimpleMetadataService;
import org.apache.datawise.sqlflow.model.SqlFlowWarning;
import org.apache.datawise.sqlflow.parser.SqlFlowParser;
import org.apache.datawise.sqlflow.SqlFlow;
import org.apache.datawise.sqlflow.tree.statement.Statement;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static java.util.Collections.emptyMap;

/**
 * Built-in lineage engine backed by the local AST analyzer (Presto/Trino grammar).
 */
public final class AstSqlFlowLineageEngine implements SqlFlowLineageEngine {

    public static final String ENGINE_ID = "sqlflow-ast";
    public static final String ENGINE_VERSION = "1.0";
    private static final Set<SqlFlowDialect> AST_FRIENDLY_DIALECTS = Set.of(
            SqlFlowDialect.GENERIC
    );
    private static final Set<SqlFlowDialect> AST_PARTIAL_DIALECTS = Set.of(
            SqlFlowDialect.HIVE,
            SqlFlowDialect.IMPALA,
            SqlFlowDialect.MYSQL,
            SqlFlowDialect.POSTGRESQL,
            SqlFlowDialect.GREENPLUM,
            SqlFlowDialect.REDSHIFT,
            SqlFlowDialect.ORACLE,
            SqlFlowDialect.MSSQL,
            SqlFlowDialect.DB2,
            SqlFlowDialect.SNOWFLAKE,
            SqlFlowDialect.TERADATA,
            SqlFlowDialect.VERTICA
    );

    private final SqlFlowParser parser;

    public AstSqlFlowLineageEngine() {
        this(SqlFlow.sharedParser());
    }

    public AstSqlFlowLineageEngine(SqlFlowParser parser) {
        this.parser = parser;
    }

    @Override
    public String engineId() {
        return ENGINE_ID;
    }

    @Override
    public String engineVersion() {
        return ENGINE_VERSION;
    }

    @Override
    public boolean isAvailable() {
        return true;
    }

    @Override
    public SqlFlowLineageResult analyze(SqlFlowAnalyzeRequest request) {
        List<SqlFlowWarning> warnings = new ArrayList<>();
        SqlFlowDialect dialect = request.dialect();
        DialectCompatibility compatibility = toApiCompatibility(dialect == null ? CompatibilityLevel.UNKNOWN : compatibilityOf(dialect));
        if (dialect != null) {
            switch (compatibilityOf(dialect)) {
                case PARTIAL -> warnings.add(SqlFlowWarning.of(
                        "DIALECT_PARTIAL_COMPAT",
                        "AST engine is partially compatible with " + dialect.vendorToken()
                ));
                case LOW -> warnings.add(SqlFlowWarning.of(
                        "DIALECT_FALLBACK",
                        "AST engine uses Presto/Trino grammar; dbType mapped to " + dialect.vendorToken()
                ));
                default -> {
                    // No warning for full compatibility.
                }
            }
        }

        try {
            Statement statement = parser.createStatement(request.sql());
            SimpleMetadataService metadataService = request.metadataTables().isEmpty()
                    ? new SimpleMetadataService("def")
                    : DefaultMetadataService.create(request.metadataTables());

            Analysis analysis = new Analysis(statement, emptyMap());
            StatementAnalyzer analyzer = new StatementAnalyzer(analysis, metadataService, parser, false);
            Scope scope = analyzer.analyze(statement, Optional.empty());

            return AstLineageSupport.fromAnalysis(analysis, scope, warnings, ENGINE_ID, ENGINE_VERSION, compatibility);
        } catch (RuntimeException ex) {
            return SqlFlowLineageResult.failed(
                    ENGINE_ID,
                    ENGINE_VERSION,
                    compatibility,
                    "PARSE_ERROR",
                    ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage()
            );
        }
    }

    private static DialectCompatibility toApiCompatibility(CompatibilityLevel level) {
        return switch (level) {
            case FULL -> DialectCompatibility.FULL;
            case PARTIAL -> DialectCompatibility.PARTIAL;
            case LOW -> DialectCompatibility.LOW;
            case UNKNOWN -> DialectCompatibility.UNKNOWN;
        };
    }

    private static CompatibilityLevel compatibilityOf(SqlFlowDialect dialect) {
        if (AST_FRIENDLY_DIALECTS.contains(dialect)) {
            return CompatibilityLevel.FULL;
        }
        if (AST_PARTIAL_DIALECTS.contains(dialect)) {
            return CompatibilityLevel.PARTIAL;
        }
        return CompatibilityLevel.LOW;
    }

    private enum CompatibilityLevel {
        FULL,
        PARTIAL,
        LOW,
        UNKNOWN
    }
}
