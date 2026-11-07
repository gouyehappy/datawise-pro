package org.apache.datawise.backend.ai.schema;

import java.util.List;

/**
 * 供 LLM SQL 生成使用的 schema 快照（表清单、DDL 片段、FK 关系、语义指标）。
 */
public record AiSqlSchemaContext(
        String connectionLabel,
        String database,
        String dbType,
        List<String> tables,
        List<AiTableDdlSnippet> tableDdls,
        List<AiTableRelationHint> tableRelations,
        List<AiSemanticMetricHint> semanticMetrics
) {
    public AiSqlSchemaContext(
            String connectionLabel,
            String database,
            String dbType,
            List<String> tables,
            List<AiTableDdlSnippet> tableDdls
    ) {
        this(connectionLabel, database, dbType, tables, tableDdls, List.of(), List.of());
    }

    public AiSqlSchemaContext(
            String connectionLabel,
            String database,
            String dbType,
            List<String> tables,
            List<AiTableDdlSnippet> tableDdls,
            List<AiTableRelationHint> tableRelations
    ) {
        this(connectionLabel, database, dbType, tables, tableDdls, tableRelations, List.of());
    }
}
