package org.apache.datawise.backend.lineage.parser.lakehouse;

import org.apache.datawise.backend.domain.LineageDialectCompatibility;
import org.apache.datawise.backend.lineage.model.ColumnLineage;
import org.apache.datawise.backend.lineage.model.LineageParseRequest;
import org.apache.datawise.backend.lineage.model.LineageParseResult;
import org.apache.datawise.backend.lineage.model.LineageWarning;
import org.apache.datawise.backend.lineage.model.ParseStatus;
import org.apache.datawise.backend.lineage.model.SourceKind;
import org.apache.datawise.backend.lineage.model.SourceRef;
import org.apache.datawise.backend.lineage.parser.lakehouse.LakehouseSqlSupport.LakehouseFeature;
import org.apache.datawise.backend.lineage.parser.lakehouse.LakehouseSqlSupport.NormalizationResult;
import org.apache.datawise.backend.lineage.parser.lakehouse.LakehouseSqlSupport.SoftenResult;
import org.apache.datawise.backend.lineage.parser.sqlflow.SqlFlowAstLineageParser;
import org.apache.datawise.backend.lineage.spi.SqlLineageParser;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Lakehouse / OLAP dialect front door: normalize safe clauses, soften hard features when possible,
 * refuse with table-level fallback when column lineage cannot be recovered, then reuse the AST engine.
 */
@Component
public class LakehouseLineageParser implements SqlLineageParser {

    private static final String ENGINE_ID = "lakehouse";
    private static final String ENGINE_VERSION = "1.1";
    private static final int PRIORITY = 40;
    private static final String TABLE_LEVEL_OUTPUT = "_table_deps";

    private final SqlFlowAstLineageParser sqlFlowAstLineageParser;

    public LakehouseLineageParser(@Lazy SqlFlowAstLineageParser sqlFlowAstLineageParser) {
        this.sqlFlowAstLineageParser = sqlFlowAstLineageParser;
    }

    @Override
    public boolean supports(String dbType) {
        return LakehouseSqlSupport.isLakehouseDialect(dbType);
    }

    @Override
    public int priority() {
        return PRIORITY;
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
    public LineageParseResult parse(LineageParseRequest request) {
        String sql = request.sql();
        if (sql == null || sql.isBlank()) {
            return LineageParseResult.failed(ENGINE_ID, ENGINE_VERSION, "SQL is required");
        }

        List<LineageWarning> warnings = new ArrayList<>();
        List<LakehouseFeature> hardFeatures = LakehouseSqlSupport.detectHardFeatures(sql);
        if (!hardFeatures.isEmpty()) {
            for (LakehouseFeature feature : hardFeatures) {
                warnings.add(LineageWarning.of(feature.code(), feature.message()));
            }

            SoftenResult softened = LakehouseSqlSupport.softenHardFeatures(sql);
            if (softened.changed()) {
                List<LineageWarning> softenWarnings = new ArrayList<>(warnings);
                softenWarnings.add(LineageWarning.of(
                        "LAKEHOUSE_SOFTENED",
                        "Softened lakehouse-only syntax for best-effort column lineage: "
                                + String.join(", ", softened.softenedFeatures())
                ));
                LineageParseResult softenedResult = parseNormalized(request, softened.sql(), softenWarnings);
                if (softenedResult.status() != ParseStatus.FAILED && !softenedResult.columns().isEmpty()) {
                    return forcePartial(softenedResult);
                }
                warnings = new ArrayList<>(softenedResult.warnings());
            }

            warnings.add(LineageWarning.of(
                    "LAKEHOUSE_UNSUPPORTED_FEATURE",
                    "Column lineage incomplete for lakehouse-only syntax; table-level dependencies may still be available"
            ));
            List<ColumnLineage> tableLevel = tableLevelColumns(request, sql);
            if (!tableLevel.isEmpty()) {
                warnings.add(LineageWarning.of(
                        "LAKEHOUSE_TABLE_LEVEL_ONLY",
                        "Returning table-level lineage only; column mappings require Calcite or simplified SQL"
                ));
                return new LineageParseResult(
                        tableLevel,
                        warnings,
                        ParseStatus.PARTIAL,
                        ENGINE_ID,
                        ENGINE_VERSION,
                        LineageDialectCompatibility.PARTIAL
                );
            }
            return new LineageParseResult(
                    List.of(),
                    warnings,
                    ParseStatus.PARTIAL,
                    ENGINE_ID,
                    ENGINE_VERSION,
                    LineageDialectCompatibility.PARTIAL
            );
        }

        return parseNormalized(request, sql, warnings);
    }

    private LineageParseResult parseNormalized(
            LineageParseRequest request,
            String sql,
            List<LineageWarning> seedWarnings
    ) {
        List<LineageWarning> warnings = new ArrayList<>(seedWarnings);
        NormalizationResult normalized = LakehouseSqlSupport.normalizeForLineage(sql);
        if (normalized.changed()) {
            warnings.add(LineageWarning.of(
                    "LAKEHOUSE_NORMALIZED",
                    "Stripped lakehouse clauses for lineage: " + String.join(", ", normalized.strippedClauses())
            ));
        }

        LineageParseRequest delegated = new LineageParseRequest(
                normalized.sql(),
                request.dbType(),
                request.connectionId(),
                request.instanceName(),
                request.database(),
                request.modelName(),
                request.maxDepth(),
                request.visitedModels(),
                request.resolution(),
                request.federatedSources()
        );
        LineageParseResult result = sqlFlowAstLineageParser.parse(delegated);
        List<LineageWarning> merged = new ArrayList<>(warnings);
        merged.addAll(result.warnings());
        if (result.status() == ParseStatus.FAILED) {
            merged.add(LineageWarning.of(
                    "LAKEHOUSE_PARSE_FAILED",
                    "Lakehouse SQL could not be analyzed with the built-in AST engine"
            ));
            return new LineageParseResult(
                    List.of(),
                    merged,
                    ParseStatus.FAILED,
                    ENGINE_ID,
                    ENGINE_VERSION,
                    LineageDialectCompatibility.PARTIAL
            );
        }

        ParseStatus status = result.status() == ParseStatus.COMPLETE && !normalized.changed()
                ? ParseStatus.COMPLETE
                : ParseStatus.PARTIAL;
        LineageDialectCompatibility compatibility = LineageDialectCompatibility.PARTIAL;
        if (isStrictLakehouse(request.dbType())) {
            if (status == ParseStatus.COMPLETE) {
                status = ParseStatus.PARTIAL;
            }
            merged.add(LineageWarning.of(
                    "LAKEHOUSE_PARTIAL_COMPAT",
                    "Lakehouse dialect lineage is best-effort for standard SELECT; advanced DDL/DML may be incomplete"
            ));
        } else if (status == ParseStatus.COMPLETE && !normalized.changed()) {
            compatibility = LineageDialectCompatibility.FULL;
        }

        return new LineageParseResult(
                result.columns(),
                merged,
                status,
                ENGINE_ID,
                ENGINE_VERSION,
                compatibility
        );
    }

    private static LineageParseResult forcePartial(LineageParseResult result) {
        List<LineageWarning> merged = new ArrayList<>(result.warnings());
        if (merged.stream().noneMatch(w -> "LAKEHOUSE_PARTIAL_COMPAT".equals(w.code()))) {
            merged.add(LineageWarning.of(
                    "LAKEHOUSE_PARTIAL_COMPAT",
                    "Lakehouse dialect lineage is best-effort after softening hard features"
            ));
        }
        return new LineageParseResult(
                result.columns(),
                merged,
                ParseStatus.PARTIAL,
                ENGINE_ID,
                ENGINE_VERSION,
                LineageDialectCompatibility.PARTIAL
        );
    }

    private static List<ColumnLineage> tableLevelColumns(LineageParseRequest request, String sql) {
        List<String> tables = LakehouseSqlSupport.extractPhysicalTables(sql);
        if (tables.isEmpty()) {
            return List.of();
        }
        List<SourceRef> sources = new ArrayList<>();
        for (String table : tables) {
            String schema = null;
            String tableName = table;
            if (table.contains(".")) {
                String[] parts = table.split("\\.", 2);
                schema = parts[0];
                tableName = parts[1];
            }
            sources.add(new SourceRef(
                    request.connectionId(),
                    request.database(),
                    schema,
                    tableName,
                    "*",
                    null,
                    SourceKind.PHYSICAL_TABLE
            ));
        }
        return List.of(new ColumnLineage(TABLE_LEVEL_OUTPUT, List.copyOf(sources), null));
    }

    private static boolean isStrictLakehouse(String dbType) {
        if (dbType == null) {
            return false;
        }
        String id = org.apache.datawise.backend.common.DbType.normalizeId(dbType);
        return "hive".equals(id) || "flink".equals(id) || "spark".equals(id) || "kylin".equals(id) || "impala".equals(id);
    }
}
