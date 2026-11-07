package org.apache.datawise.backend.lineage.service;

import org.apache.datawise.backend.domain.LineageColumnMappingDto;
import org.apache.datawise.backend.domain.LineageEdgeDto;
import org.apache.datawise.backend.domain.LineageGraphDto;
import org.apache.datawise.backend.domain.LineageMetaDto;
import org.apache.datawise.backend.domain.LineageNodeDto;
import org.apache.datawise.backend.domain.LineageNodeRefDto;
import org.apache.datawise.backend.domain.LineageSourceColumnDto;
import org.apache.datawise.backend.domain.LineageWarningDto;
import org.apache.datawise.backend.lineage.model.ColumnLineage;
import org.apache.datawise.backend.lineage.model.ExpressionNode;
import org.apache.datawise.backend.lineage.model.LineageParseRequest;
import org.apache.datawise.backend.lineage.model.LineageParseResult;
import org.apache.datawise.backend.lineage.model.LineageWarning;
import org.apache.datawise.backend.lineage.model.ParseStatus;
import org.apache.datawise.backend.lineage.model.SourceKind;
import org.apache.datawise.backend.lineage.model.SourceRef;
import org.apache.datawise.backend.lineage.resolver.ViewModelLineageLoader;
import org.apache.datawise.backend.lineage.support.LineageSqlHash;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class LineageGraphBuilder {

    private final ViewModelLineageLoader viewModelLineageLoader;

    public LineageGraphBuilder(ViewModelLineageLoader viewModelLineageLoader) {
        this.viewModelLineageLoader = viewModelLineageLoader;
    }

    public LineageGraphDto build(
            String modelName,
            String sql,
            String dbType,
            int depth,
            LineageParseResult parseResult,
            LineageParseRequest parseRequest
    ) {
        String modelId = modelNodeId(modelName);
        Map<String, LineageNodeDto> nodes = new LinkedHashMap<>();
        List<LineageEdgeDto> edges = new ArrayList<>();
        AtomicInteger edgeSeq = new AtomicInteger();
        List<LineageWarning> expansionWarnings = new ArrayList<>();

        nodes.put(modelId, new LineageNodeDto(
                modelId,
                "model",
                modelName,
                modelName,
                null,
                null,
                null
        ));

        Set<String> expandedViewModels = new HashSet<>();

        for (ColumnLineage column : parseResult.columns()) {
            String outputId = outputColumnId(modelName, column.outputColumn());
            nodes.putIfAbsent(outputId, new LineageNodeDto(
                    outputId,
                    "column",
                    column.outputColumn(),
                    modelName + "." + column.outputColumn(),
                    null,
                    null,
                    null
            ));
            edges.add(edge(edgeSeq, modelId, outputId, "direct", null));

            if (column.expressionTree() == null) {
                for (SourceRef source : column.sources()) {
                    connectSource(
                            nodes,
                            edges,
                            edgeSeq,
                            outputId,
                            source,
                            parseRequest,
                            expansionWarnings,
                            expandedViewModels,
                            depth
                    );
                }
                continue;
            }

            String exprRootId = addExpressionTree(
                    nodes,
                    edges,
                    edgeSeq,
                    modelName,
                    column.outputColumn(),
                    "root",
                    column.expressionTree(),
                    parseRequest,
                    expansionWarnings,
                    expandedViewModels,
                    depth
            );
            edges.add(edge(edgeSeq, exprRootId, outputId, "transform", null));
        }

        List<LineageWarningDto> warnings = new ArrayList<>(parseResult.warnings().stream()
                .map(this::toWarningDto)
                .toList());
        expansionWarnings.stream().map(this::toWarningDto).forEach(warnings::add);

        ParseStatus status = parseResult.status();
        if (!expansionWarnings.isEmpty() && status == ParseStatus.COMPLETE) {
            status = ParseStatus.PARTIAL;
        }

        LineageMetaDto meta = new LineageMetaDto(
                LineageSqlHash.sha256(sql),
                Instant.now().toString(),
                dbType != null ? dbType : "generic",
                parseResult.dialectCompatibility(),
                parseResult.engineId(),
                parseResult.engineVersion(),
                depth,
                status.name().toLowerCase(Locale.ROOT),
                warnings
        );

        List<LineageColumnMappingDto> columnMappings = buildColumnMappings(
                parseResult.columns(),
                parseRequest,
                expansionWarnings,
                depth
        );

        return new LineageGraphDto(
                new LineageNodeRefDto(modelId, modelName, "model"),
                List.copyOf(nodes.values()),
                edges,
                meta,
                columnMappings
        );
    }

    private List<LineageColumnMappingDto> buildColumnMappings(
            List<ColumnLineage> columns,
            LineageParseRequest parseRequest,
            List<LineageWarning> warnings,
            int depth
    ) {
        Set<String> expandedViewModels = new HashSet<>();
        List<LineageColumnMappingDto> mappings = new ArrayList<>();
        for (ColumnLineage column : columns) {
            LinkedHashSet<LineageSourceColumnDto> sources = new LinkedHashSet<>();
            collectMappingSources(column.sources(), parseRequest, warnings, expandedViewModels, depth, sources);
            if (column.expressionTree() != null) {
                collectExpressionSources(column.expressionTree(), parseRequest, warnings, expandedViewModels, depth, sources);
            }
            String expression = column.expressionTree() != null
                    ? describeExpression(column.expressionTree()).expression()
                    : null;
            mappings.add(new LineageColumnMappingDto(
                    column.outputColumn(),
                    List.copyOf(sources),
                    expression
            ));
        }
        return mappings;
    }

    private void collectMappingSources(
            List<SourceRef> refs,
            LineageParseRequest parseRequest,
            List<LineageWarning> warnings,
            Set<String> expandedViewModels,
            int depth,
            Set<LineageSourceColumnDto> sink
    ) {
        for (SourceRef ref : refs) {
            if (ref.kind() == SourceKind.VIEW_MODEL) {
                expandViewModelSources(ref, parseRequest, warnings, expandedViewModels, depth, sink);
                continue;
            }
            sink.add(toSourceColumnDto(ref));
        }
    }

    private void collectExpressionSources(
            ExpressionNode node,
            LineageParseRequest parseRequest,
            List<LineageWarning> warnings,
            Set<String> expandedViewModels,
            int depth,
            Set<LineageSourceColumnDto> sink
    ) {
        if (node instanceof ExpressionNode.ColumnRef columnRef) {
            collectMappingSources(
                    List.of(columnRef.ref()),
                    parseRequest,
                    warnings,
                    expandedViewModels,
                    depth,
                    sink
            );
            return;
        }
        if (node instanceof ExpressionNode.Function function) {
            for (ExpressionNode arg : function.args()) {
                collectExpressionSources(arg, parseRequest, warnings, expandedViewModels, depth, sink);
            }
            return;
        }
        if (node instanceof ExpressionNode.Binary binary) {
            collectExpressionSources(binary.left(), parseRequest, warnings, expandedViewModels, depth, sink);
            collectExpressionSources(binary.right(), parseRequest, warnings, expandedViewModels, depth, sink);
            return;
        }
        if (node instanceof ExpressionNode.CaseExpr caseExpr) {
            for (ExpressionNode.WhenThen whenThen : caseExpr.whens()) {
                collectExpressionSources(whenThen.condition(), parseRequest, warnings, expandedViewModels, depth, sink);
                collectExpressionSources(whenThen.result(), parseRequest, warnings, expandedViewModels, depth, sink);
            }
            if (caseExpr.elseExpr() != null) {
                collectExpressionSources(caseExpr.elseExpr(), parseRequest, warnings, expandedViewModels, depth, sink);
            }
            return;
        }
        if (node instanceof ExpressionNode.CastExpr cast) {
            collectExpressionSources(cast.inner(), parseRequest, warnings, expandedViewModels, depth, sink);
        }
    }

    private void expandViewModelSources(
            SourceRef viewModelSource,
            LineageParseRequest parseRequest,
            List<LineageWarning> warnings,
            Set<String> expandedViewModels,
            int depth,
            Set<LineageSourceColumnDto> sink
    ) {
        String key = viewModelSource.table() + ":" + viewModelSource.column();
        if (!expandedViewModels.add(key)) {
            return;
        }
        Optional<LineageParseResult> childResult = viewModelLineageLoader.parseViewModel(
                viewModelSource.table(),
                parseRequest,
                warnings
        );
        if (childResult.isEmpty()) {
            sink.add(toSourceColumnDto(viewModelSource));
            return;
        }
        ColumnLineage childColumn = childResult.get().columns().stream()
                .filter(column -> column.outputColumn().equalsIgnoreCase(viewModelSource.column()))
                .findFirst()
                .orElse(null);
        if (childColumn == null) {
            sink.add(toSourceColumnDto(viewModelSource));
            return;
        }
        LineageParseRequest childRequest = childParseRequest(parseRequest, viewModelSource.table(), depth);
        collectMappingSources(childColumn.sources(), childRequest, warnings, expandedViewModels, depth - 1, sink);
        if (childColumn.expressionTree() != null) {
            collectExpressionSources(
                    childColumn.expressionTree(),
                    childRequest,
                    warnings,
                    expandedViewModels,
                    depth - 1,
                    sink
            );
        }
    }

    private static LineageSourceColumnDto toSourceColumnDto(SourceRef ref) {
        return new LineageSourceColumnDto(
                ref.schema(),
                ref.table(),
                ref.column(),
                ref.qualifiedColumn(),
                ref.kind().name().toLowerCase(Locale.ROOT)
        );
    }

    private void connectSource(
            Map<String, LineageNodeDto> nodes,
            List<LineageEdgeDto> edges,
            AtomicInteger edgeSeq,
            String outputId,
            SourceRef source,
            LineageParseRequest parseRequest,
            List<LineageWarning> warnings,
            Set<String> expandedViewModels,
            int depth
    ) {
        if (source.kind() == SourceKind.VIEW_MODEL) {
            String viewModelColumnId = upsertViewModelColumn(nodes, source);
            edges.add(edge(edgeSeq, viewModelColumnId, outputId, "direct", null));
            expandViewModel(
                    nodes,
                    edges,
                    edgeSeq,
                    source,
                    parseRequest,
                    warnings,
                    expandedViewModels,
                    depth
            );
            return;
        }
        String sourceId = upsertSourceColumn(nodes, source);
        edges.add(edge(edgeSeq, sourceId, outputId, "direct", null));
    }

    private void expandViewModel(
            Map<String, LineageNodeDto> nodes,
            List<LineageEdgeDto> edges,
            AtomicInteger edgeSeq,
            SourceRef viewModelSource,
            LineageParseRequest parseRequest,
            List<LineageWarning> warnings,
            Set<String> expandedViewModels,
            int depth
    ) {
        String modelName = viewModelSource.table();
        String expansionKey = modelName + ":" + viewModelSource.column();
        if (!expandedViewModels.add(expansionKey)) {
            return;
        }
        Optional<LineageParseResult> childResult = viewModelLineageLoader.parseViewModel(
                modelName,
                parseRequest,
                warnings
        );
        if (childResult.isEmpty()) {
            return;
        }
        warnings.addAll(childResult.get().warnings());
        String childModelId = modelNodeId(modelName);
        nodes.putIfAbsent(childModelId, new LineageNodeDto(
                childModelId,
                "model",
                modelName,
                modelName,
                null,
                null,
                null
        ));
        ColumnLineage childColumn = childResult.get().columns().stream()
                .filter(column -> column.outputColumn().equalsIgnoreCase(viewModelSource.column()))
                .findFirst()
                .orElse(null);
        if (childColumn == null) {
            warnings.add(LineageWarning.of(
                    "VIEW_MODEL_COLUMN_NOT_FOUND",
                    "Column not found in ViewModel " + modelName + ": " + viewModelSource.column()
            ));
            return;
        }
        String childOutputId = outputColumnId(modelName, childColumn.outputColumn());
        nodes.putIfAbsent(childOutputId, new LineageNodeDto(
                childOutputId,
                "column",
                childColumn.outputColumn(),
                modelName + "." + childColumn.outputColumn(),
                null,
                null,
                null
        ));
        edges.add(edge(edgeSeq, childModelId, childOutputId, "direct", null));
        String viewModelColumnId = viewModelColumnId(viewModelSource);
        edges.add(edge(edgeSeq, childOutputId, viewModelColumnId, "direct", null));

        LineageParseRequest childRequest = childParseRequest(parseRequest, modelName, depth);
        if (childColumn.expressionTree() == null) {
            for (SourceRef nestedSource : childColumn.sources()) {
                connectSource(
                        nodes,
                        edges,
                        edgeSeq,
                        childOutputId,
                        nestedSource,
                        childRequest,
                        warnings,
                        expandedViewModels,
                        depth - 1
                );
            }
            return;
        }
        String exprRootId = addExpressionTree(
                nodes,
                edges,
                edgeSeq,
                modelName,
                childColumn.outputColumn(),
                "root",
                childColumn.expressionTree(),
                childRequest,
                warnings,
                expandedViewModels,
                depth - 1
        );
        edges.add(edge(edgeSeq, exprRootId, childOutputId, "transform", null));
    }

    private static LineageParseRequest childParseRequest(
            LineageParseRequest parent,
            String childModelName,
            int depth
    ) {
        Set<String> visited = new HashSet<>(parent.visitedModels());
        visited.add(childModelName.toLowerCase(Locale.ROOT));
        return new LineageParseRequest(
                parent.sql(),
                parent.dbType(),
                parent.connectionId(),
                parent.instanceName(),
                parent.database(),
                childModelName,
                Math.max(0, depth - 1),
                Set.copyOf(visited),
                parent.resolution()
        );
    }

    private String addExpressionTree(
            Map<String, LineageNodeDto> nodes,
            List<LineageEdgeDto> edges,
            AtomicInteger edgeSeq,
            String modelName,
            String outputColumn,
            String path,
            ExpressionNode node,
            LineageParseRequest parseRequest,
            List<LineageWarning> warnings,
            Set<String> expandedViewModels,
            int depth
    ) {
        if (node instanceof ExpressionNode.ColumnRef columnRef) {
            if (columnRef.ref().kind() == SourceKind.VIEW_MODEL) {
                String viewModelColumnId = upsertViewModelColumn(nodes, columnRef.ref());
                expandViewModel(
                        nodes,
                        edges,
                        edgeSeq,
                        columnRef.ref(),
                        parseRequest,
                        warnings,
                        expandedViewModels,
                        depth
                );
                return viewModelColumnId;
            }
            return upsertSourceColumn(nodes, columnRef.ref());
        }
        String exprId = expressionId(modelName, outputColumn, path);
        ExpressionPresentation presentation = describeExpression(node);
        nodes.putIfAbsent(exprId, new LineageNodeDto(
                exprId,
                "expression",
                presentation.label(),
                null,
                null,
                presentation.expression(),
                presentation.kind()
        ));

        List<ExpressionChild> children = expressionChildren(node);
        for (int i = 0; i < children.size(); i++) {
            ExpressionChild child = children.get(i);
            String childId = addExpressionTree(
                    nodes,
                    edges,
                    edgeSeq,
                    modelName,
                    outputColumn,
                    path + ":" + i,
                    child.node(),
                    parseRequest,
                    warnings,
                    expandedViewModels,
                    depth
            );
            edges.add(edge(edgeSeq, childId, exprId, "transform", child.edgeLabel()));
        }
        return exprId;
    }

    private static String upsertViewModelColumn(Map<String, LineageNodeDto> nodes, SourceRef source) {
        String modelId = modelNodeId(source.table());
        nodes.putIfAbsent(modelId, new LineageNodeDto(
                modelId,
                "model",
                source.table(),
                source.table(),
                null,
                null,
                null
        ));
        String columnId = viewModelColumnId(source);
        nodes.putIfAbsent(columnId, new LineageNodeDto(
                columnId,
                "column",
                source.column(),
                source.table() + "." + source.column(),
                null,
                null,
                null
        ));
        return columnId;
    }

    private static String viewModelColumnId(SourceRef source) {
        return "vmcol:" + source.table() + ":" + source.column();
    }

    private static String upsertSourceColumn(Map<String, LineageNodeDto> nodes, SourceRef source) {
        String tableKey = tableKey(source);
        String tableId = "table:" + tableKey;
        nodes.putIfAbsent(tableId, new LineageNodeDto(
                tableId,
                "table",
                source.table() != null ? source.table() : tableKey,
                tableKey,
                null,
                null,
                null
        ));
        String columnId = "col:" + tableKey + "." + source.column();
        nodes.putIfAbsent(columnId, new LineageNodeDto(
                columnId,
                "column",
                source.column(),
                source.qualifiedColumn(),
                null,
                null,
                null
        ));
        return columnId;
    }

    private static String tableKey(SourceRef source) {
        if (source.schema() != null && !source.schema().isBlank()) {
            return source.schema() + "." + source.table();
        }
        return source.table() != null ? source.table() : "unknown";
    }

    private static String modelNodeId(String modelName) {
        return "model:" + modelName;
    }

    private static String outputColumnId(String modelName, String column) {
        return "out:" + modelName + ":" + column;
    }

    private static String expressionId(String modelName, String column, String path) {
        return "expr:" + modelName + ":" + column + ":" + path;
    }

    private static LineageEdgeDto edge(
            AtomicInteger seq,
            String from,
            String to,
            String role,
            String label
    ) {
        return new LineageEdgeDto(
                "edge:" + seq.incrementAndGet(),
                from,
                to,
                role,
                label
        );
    }

    private LineageWarningDto toWarningDto(LineageWarning warning) {
        return new LineageWarningDto(
                warning.code(),
                warning.message(),
                warning.line(),
                warning.column()
        );
    }

    private static ExpressionPresentation describeExpression(ExpressionNode node) {
        if (node instanceof ExpressionNode.Function function) {
            return new ExpressionPresentation(
                    function.name() + "(…)",
                    function.name() + "(…)",
                    "function"
            );
        }
        if (node instanceof ExpressionNode.Binary binary) {
            return new ExpressionPresentation(
                    binary.operator(),
                    binary.operator(),
                    "operator"
            );
        }
        if (node instanceof ExpressionNode.CaseExpr) {
            return new ExpressionPresentation("CASE", "CASE WHEN …", "case");
        }
        if (node instanceof ExpressionNode.CastExpr cast) {
            return new ExpressionPresentation("CAST", "CAST(… AS " + cast.targetType() + ")", "cast");
        }
        if (node instanceof ExpressionNode.Literal literal) {
            return new ExpressionPresentation(literal.value(), literal.value(), "literal");
        }
        if (node instanceof ExpressionNode.AllColumns allColumns) {
            String label = allColumns.tableQualifier() != null
                    ? allColumns.tableQualifier() + ".*"
                    : "*";
            return new ExpressionPresentation(label, label, "literal");
        }
        return new ExpressionPresentation("expr", "expression", "operator");
    }

    private static List<ExpressionChild> expressionChildren(ExpressionNode node) {
        List<ExpressionChild> children = new ArrayList<>();
        if (node instanceof ExpressionNode.Function function) {
            for (ExpressionNode arg : function.args()) {
                children.add(new ExpressionChild(arg, null));
            }
            return children;
        }
        if (node instanceof ExpressionNode.Binary binary) {
            children.add(new ExpressionChild(binary.left(), null));
            children.add(new ExpressionChild(binary.right(), binary.operator()));
            return children;
        }
        if (node instanceof ExpressionNode.CaseExpr caseExpr) {
            for (ExpressionNode.WhenThen whenThen : caseExpr.whens()) {
                children.add(new ExpressionChild(whenThen.condition(), "WHEN"));
                children.add(new ExpressionChild(whenThen.result(), "THEN"));
            }
            if (caseExpr.elseExpr() != null) {
                children.add(new ExpressionChild(caseExpr.elseExpr(), "ELSE"));
            }
            return children;
        }
        if (node instanceof ExpressionNode.CastExpr cast) {
            children.add(new ExpressionChild(cast.inner(), "CAST"));
        }
        return children;
    }

    private record ExpressionPresentation(String label, String expression, String kind) {
    }

    private record ExpressionChild(ExpressionNode node, String edgeLabel) {
    }
}
