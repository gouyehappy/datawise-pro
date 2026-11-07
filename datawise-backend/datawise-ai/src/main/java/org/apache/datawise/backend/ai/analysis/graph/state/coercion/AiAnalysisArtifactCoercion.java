package org.apache.datawise.backend.ai.analysis.graph.state.coercion;

import org.apache.datawise.backend.ai.schema.AiSemanticMetricHint;
import org.apache.datawise.backend.ai.schema.AiSqlSchemaContext;
import org.apache.datawise.backend.ai.schema.AiTableRelationHint;
import org.apache.datawise.backend.ai.schema.AiTableDdlSnippet;
import org.apache.datawise.backend.ai.domain.AiAnalysisReportDto;
import org.apache.datawise.backend.ai.domain.AiChartSpecDto;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.ai.domain.AiEvidenceBundle;
import org.apache.datawise.backend.ai.domain.AiEvidenceSnippet;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.apache.datawise.backend.ai.analysis.graph.state.coercion.GraphStateValueCoercion.castListOfMaps;
import static org.apache.datawise.backend.ai.analysis.graph.state.coercion.GraphStateValueCoercion.castStringList;
import static org.apache.datawise.backend.ai.analysis.graph.state.coercion.GraphStateValueCoercion.doubleValue;
import static org.apache.datawise.backend.ai.analysis.graph.state.coercion.GraphStateValueCoercion.intValue;
import static org.apache.datawise.backend.ai.analysis.graph.state.coercion.GraphStateValueCoercion.longValue;
import static org.apache.datawise.backend.ai.analysis.graph.state.coercion.GraphStateValueCoercion.stringValue;

/**
 * 将 checkpoint 中的 analysis 产物 Map 还原为强类型对象
 */
public final class AiAnalysisArtifactCoercion {

    private AiAnalysisArtifactCoercion() {
    }

    public static ExecuteSqlResult executeResult(Object raw) {
        if (raw instanceof ExecuteSqlResult result) {
            return result;
        }
        if (!(raw instanceof Map<?, ?> map)) {
            return null;
        }
        return new ExecuteSqlResult(
                stringValue(map.get("sql")),
                intValue(map.get("rowCount")),
                longValue(map.get("durationMs")),
                castListOfMaps(map.get("columns")),
                castListOfMaps(map.get("rows")),
                stringValue(map.get("where")),
                stringValue(map.get("orderBy")),
                stringValue(map.get("cursorId")),
                map.get("hasMore") instanceof Boolean hasMore ? hasMore : null,
                intValue(map.get("pageOffset")),
                intValue(map.get("pageSize"))
        );
    }

    public static AiChartSpecDto chart(Object raw) {
        if (raw instanceof AiChartSpecDto chart) {
            return chart;
        }
        if (!(raw instanceof Map<?, ?> map)) {
            return null;
        }
        String type = stringValue(map.get("type"));
        if (type == null) {
            return null;
        }
        return new AiChartSpecDto(
                type,
                stringValue(map.get("title")),
                stringValue(map.get("xField")),
                castStringList(map.get("yFields")),
                castStringList(map.get("seriesNames"))
        );
    }

    public static AiAnalysisReportDto report(Object raw) {
        if (raw instanceof AiAnalysisReportDto report) {
            return report;
        }
        if (!(raw instanceof Map<?, ?> map)) {
            return null;
        }
        String markdown = stringValue(map.get("markdown"));
        if (markdown == null) {
            return null;
        }
        return new AiAnalysisReportDto(markdown, stringValue(map.get("html")));
    }

    public static AiSqlSchemaContext schemaContext(Object raw) {
        if (raw instanceof AiSqlSchemaContext schema) {
            return schema;
        }
        if (!(raw instanceof Map<?, ?> map)) {
            return null;
        }
        List<AiTableDdlSnippet> ddls = new ArrayList<>();
        Object ddlsRaw = map.get("tableDdls");
        if (ddlsRaw instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof AiTableDdlSnippet snippet) {
                    ddls.add(snippet);
                } else if (item instanceof Map<?, ?> ddlMap) {
                    ddls.add(new AiTableDdlSnippet(
                            stringValue(ddlMap.get("table")),
                            stringValue(ddlMap.get("ddl"))
                    ));
                }
            }
        }
        List<AiTableRelationHint> relations = new ArrayList<>();
        Object relationsRaw = map.get("tableRelations");
        if (relationsRaw instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof AiTableRelationHint relation) {
                    relations.add(relation);
                } else if (item instanceof Map<?, ?> relationMap) {
                    relations.add(new AiTableRelationHint(
                            stringValue(relationMap.get("fromTable")),
                            stringValue(relationMap.get("fromColumn")),
                            stringValue(relationMap.get("toTable")),
                            stringValue(relationMap.get("toColumn"))
                    ));
                }
            }
        }
        List<AiSemanticMetricHint> metrics = new ArrayList<>();
        Object metricsRaw = map.get("semanticMetrics");
        if (metricsRaw instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof AiSemanticMetricHint hint) {
                    metrics.add(hint);
                } else if (item instanceof Map<?, ?> metricMap) {
                    metrics.add(new AiSemanticMetricHint(
                            stringValue(metricMap.get("name")),
                            stringValue(metricMap.get("expression")),
                            stringValue(metricMap.get("description")),
                            stringValue(metricMap.get("unit"))
                    ));
                }
            }
        }
        return new AiSqlSchemaContext(
                stringValue(map.get("connectionLabel")),
                stringValue(map.get("database")),
                stringValue(map.get("dbType")),
                castStringList(map.get("tables")),
                ddls,
                relations,
                metrics
        );
    }

    public static AiEvidenceBundle evidenceBundle(Object raw) {
        if (raw instanceof AiEvidenceBundle bundle) {
            return bundle;
        }
        if (!(raw instanceof Map<?, ?> map)) {
            return null;
        }
        List<AiEvidenceSnippet> snippets = new ArrayList<>();
        Object snippetsRaw = map.get("snippets");
        if (snippetsRaw instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof AiEvidenceSnippet snippet) {
                    snippets.add(snippet);
                } else if (item instanceof Map<?, ?> snippetMap) {
                    snippets.add(new AiEvidenceSnippet(
                            stringValue(snippetMap.get("source")),
                            stringValue(snippetMap.get("title")),
                            stringValue(snippetMap.get("content")),
                            doubleValue(snippetMap.get("score"))
                    ));
                }
            }
        }
        return new AiEvidenceBundle(
                stringValue(map.get("rewrittenQuery")),
                snippets,
                castStringList(map.get("hintedTables")),
                castStringList(map.get("retrievalModes"))
        );
    }
}
