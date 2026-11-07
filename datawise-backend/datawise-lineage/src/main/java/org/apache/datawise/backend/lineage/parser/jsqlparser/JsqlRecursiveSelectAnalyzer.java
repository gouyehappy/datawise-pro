package org.apache.datawise.backend.lineage.parser.jsqlparser;

import net.sf.jsqlparser.expression.Alias;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.schema.Table;
import net.sf.jsqlparser.statement.select.AllColumns;
import net.sf.jsqlparser.statement.select.AllTableColumns;
import net.sf.jsqlparser.statement.select.FromItem;
import net.sf.jsqlparser.statement.select.Join;
import net.sf.jsqlparser.statement.select.LateralSubSelect;
import net.sf.jsqlparser.statement.select.ParenthesedFromItem;
import net.sf.jsqlparser.statement.select.ParenthesedSelect;
import net.sf.jsqlparser.statement.select.PlainSelect;
import net.sf.jsqlparser.statement.select.Select;
import net.sf.jsqlparser.statement.select.SelectItem;
import net.sf.jsqlparser.statement.select.SetOperationList;
import net.sf.jsqlparser.statement.select.WithItem;
import org.apache.datawise.backend.lineage.model.ColumnLineage;
import org.apache.datawise.backend.lineage.model.ExpressionNode;
import org.apache.datawise.backend.lineage.model.LineageParseRequest;
import org.apache.datawise.backend.lineage.model.LineageResolutionContext;
import org.apache.datawise.backend.lineage.model.LineageWarning;
import org.apache.datawise.backend.lineage.model.SourceKind;
import org.apache.datawise.backend.lineage.model.SourceRef;
import org.apache.datawise.backend.lineage.resolver.ViewModelLineageLoader;
import org.apache.datawise.backend.lineage.spi.SchemaCatalog;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

final class JsqlRecursiveSelectAnalyzer {

    private final JsqlLineageVisitorContext context;
    private final LineageParseRequest request;
    private final ViewModelLineageLoader viewModelLineageLoader;

    JsqlRecursiveSelectAnalyzer(
            JsqlLineageVisitorContext context,
            LineageParseRequest request,
            ViewModelLineageLoader viewModelLineageLoader
    ) {
        this.context = context;
        this.request = request;
        this.viewModelLineageLoader = viewModelLineageLoader;
    }

    List<ColumnLineage> analyze(Select select) {
        context.pushCteScope();
        try {
            registerWithItems(select.getWithItemsList());
            if (select instanceof SetOperationList setOperationList) {
                return analyzeSetOperationList(setOperationList);
            }
            PlainSelect plainSelect = select.getPlainSelect();
            if (plainSelect != null) {
                return analyzePlainSelect(plainSelect);
            }
            context.warnings().add(LineageWarning.of(
                    "UNSUPPORTED_SYNTAX",
                    "Unsupported SELECT body: " + select.getClass().getSimpleName()
            ));
            return List.of();
        } finally {
            context.popCteScope();
        }
    }

    private void registerWithItems(List<WithItem<?>> withItems) {
        if (withItems == null || withItems.isEmpty()) {
            return;
        }
        for (WithItem<?> withItem : withItems) {
            registerWithItem(withItem);
        }
    }

    private void registerWithItem(WithItem<?> withItem) {
        if (withItem == null) {
            return;
        }
        String cteName = withItem.getAliasName();
        ParenthesedSelect parenthesedSelect = withItem.getSelect();
        if (cteName == null || cteName.isBlank() || parenthesedSelect == null) {
            context.warnings().add(LineageWarning.of(
                    "UNSUPPORTED_SYNTAX",
                    "CTE requires alias and SELECT body"
            ));
            return;
        }
        List<ColumnLineage> outputs = analyze(parenthesedSelect);
        context.registerCte(cteName, outputs);
    }

    private List<ColumnLineage> analyzePlainSelect(PlainSelect plainSelect) {
        context.pushScope();
        try {
            JsqlScopeContext scope = new JsqlScopeContext(context);
            registerFromClause(scope, plainSelect.getFromItem(), plainSelect.getJoins());

            JsqlExpressionLineageExtractor extractor = new JsqlExpressionLineageExtractor(
                    context.connectionId(),
                    context.database(),
                    scope,
                    context.warnings()
            );
            List<ColumnLineage> columns = new ArrayList<>();
            if (plainSelect.getSelectItems() != null) {
                for (SelectItem<?> item : plainSelect.getSelectItems()) {
                    columns.addAll(extractSelectItems(item, scope, extractor));
                }
            }
            return columns;
        } finally {
            context.popScope();
        }
    }

    private List<ColumnLineage> extractSelectItems(
            SelectItem<?> item,
            JsqlScopeContext scope,
            JsqlExpressionLineageExtractor extractor
    ) {
        Expression expression = item.getExpression();
        if (expression instanceof AllColumns) {
            return expandStar(scope, null);
        }
        if (expression instanceof AllTableColumns allTableColumns) {
            String qualifier = allTableColumns.getTable() != null
                    ? allTableColumns.getTable().getName()
                    : null;
            return expandStar(scope, qualifier);
        }
        return List.of(extractSelectItem(item, extractor));
    }

    private List<ColumnLineage> expandStar(JsqlScopeContext scope, String qualifier) {
        List<JsqlRelationBinding> targets = resolveStarTargets(scope, qualifier);
        if (targets.isEmpty()) {
            context.warnings().add(LineageWarning.of(
                    "UNSUPPORTED_SYNTAX",
                    qualifier == null
                            ? "SELECT * expansion requires schema metadata"
                            : "SELECT " + qualifier + ".* expansion requires schema metadata"
            ));
            return List.of();
        }
        List<ColumnLineage> expanded = new ArrayList<>();
        for (JsqlRelationBinding binding : targets) {
            expanded.addAll(expandBindingColumns(binding));
        }
        return expanded;
    }

    private List<JsqlRelationBinding> resolveStarTargets(JsqlScopeContext scope, String qualifier) {
        if (qualifier != null && !qualifier.isBlank()) {
            return scope.resolveRelation(qualifier)
                    .map(List::of)
                    .orElseGet(List::of);
        }
        return context.currentScope().allRelations();
    }

    private List<ColumnLineage> expandBindingColumns(JsqlRelationBinding binding) {
        if (binding.isDerived()) {
            return binding.findAllOutputs();
        }
        return expandPhysicalTable(binding.tableName(), binding.alias());
    }

    private List<ColumnLineage> expandPhysicalTable(String tableName, String tableAlias) {
        SchemaCatalog schema = request.resolution().schema();
        String[] parts = splitSchema(tableName);
        List<String> columns = schema.columns(parts[0], parts[1]);
        if (columns.isEmpty()) {
            context.warnings().add(LineageWarning.of(
                    "UNSUPPORTED_SYNTAX",
                    "SELECT * expansion requires schema metadata for table: " + tableName
            ));
            return List.of();
        }
        List<ColumnLineage> expanded = new ArrayList<>(columns.size());
        for (String column : columns) {
            SourceRef source = new SourceRef(
                    request.connectionId(),
                    request.database(),
                    parts[0],
                    parts[1],
                    column,
                    tableAlias,
                    SourceKind.PHYSICAL_TABLE
            );
            expanded.add(new ColumnLineage(column, List.of(source), null));
        }
        return expanded;
    }

    private List<ColumnLineage> analyzeSetOperationList(SetOperationList setOperationList) {
        List<List<ColumnLineage>> branches = new ArrayList<>();
        if (setOperationList.getSelects() != null) {
            for (Select branch : setOperationList.getSelects()) {
                branches.add(analyze(branch));
            }
        }
        return mergeUnionBranches(branches);
    }

    private List<ColumnLineage> mergeUnionBranches(List<List<ColumnLineage>> branches) {
        if (branches.isEmpty()) {
            return List.of();
        }
        List<ColumnLineage> first = branches.get(0);
        List<ColumnLineage> merged = new ArrayList<>(first.size());
        for (int index = 0; index < first.size(); index++) {
            String outputColumn = first.get(index).outputColumn();
            Set<SourceRef> sources = new LinkedHashSet<>();
            ExpressionNode expressionTree = null;
            boolean expressionConflict = false;
            for (List<ColumnLineage> branch : branches) {
                if (index >= branch.size()) {
                    context.warnings().add(LineageWarning.of(
                            "UNION_COLUMN_MISMATCH",
                            "UNION branches have different column counts"
                    ));
                    continue;
                }
                ColumnLineage column = branch.get(index);
                sources.addAll(column.sources());
                if (expressionTree == null) {
                    expressionTree = column.expressionTree();
                } else if (!expressionEquals(expressionTree, column.expressionTree())) {
                    expressionConflict = true;
                }
            }
            if (expressionConflict) {
                expressionTree = null;
                context.warnings().add(LineageWarning.of(
                        "UNION_EXPR_MISMATCH",
                        "UNION column at position " + (index + 1) + " has different expressions across branches"
                ));
            }
            merged.add(new ColumnLineage(outputColumn, List.copyOf(sources), expressionTree));
        }
        return merged;
    }

    private void registerFromClause(JsqlScopeContext scope, FromItem fromItem, List<Join> joins) {
        registerFromItem(scope, fromItem);
        if (joins != null) {
            for (Join join : joins) {
                registerFromItem(scope, join.getFromItem());
            }
        }
    }

    private void registerFromItem(JsqlScopeContext scope, FromItem fromItem) {
        if (fromItem == null) {
            return;
        }
        if (fromItem instanceof Table table) {
            registerTable(scope, table);
            return;
        }
        if (fromItem instanceof ParenthesedSelect subquery) {
            registerSubquery(scope, subquery);
            return;
        }
        if (fromItem instanceof ParenthesedFromItem parenthesed) {
            registerFromItem(scope, parenthesed.getFromItem());
            if (parenthesed.getJoins() != null) {
                for (Join join : parenthesed.getJoins()) {
                    registerFromItem(scope, join.getFromItem());
                }
            }
            return;
        }
        if (fromItem instanceof LateralSubSelect lateralSubSelect) {
            registerSubquery(scope, lateralSubSelect);
            return;
        }
        scope.registerFromItem(fromItem);
    }

    private void registerTable(JsqlScopeContext scope, Table table) {
        String tableName = table.getName();
        String alias = aliasName(table.getAlias(), tableName);
        if (viewModelLineageLoader != null && request.resolution().isViewModel(tableName)) {
            List<ColumnLineage> outputs = viewModelLineageLoader.loadOutputColumns(
                    tableName,
                    request,
                    request.resolution(),
                    context.warnings()
            );
            scope.registerDerivedRelation(JsqlRelationBinding.Kind.VIEW_MODEL, alias, outputs);
            return;
        }
        scope.registerFromItem(table);
    }

    private void registerSubquery(JsqlScopeContext scope, ParenthesedSelect subquery) {
        List<ColumnLineage> outputs = analyze(subquery);
        String alias = aliasName(subquery.getAlias(), "subquery");
        scope.registerDerivedRelation(JsqlRelationBinding.Kind.SUBQUERY, alias, outputs);
    }

    private ColumnLineage extractSelectItem(SelectItem<?> item, JsqlExpressionLineageExtractor extractor) {
        Expression expression = item.getExpression();
        if (expression == null) {
            return new ColumnLineage(item.toString(), List.of(), null);
        }
        JsqlExpressionLineageExtractor.Extraction extraction = extractor.extract(expression);
        String outputColumn = JsqlExpressionLineageExtractor.outputColumnName(expression, item.getAlias());
        return new ColumnLineage(
                outputColumn,
                extraction.sources(),
                isDirect(extraction) ? null : extraction.expressionTree()
        );
    }

    private static boolean isDirect(JsqlExpressionLineageExtractor.Extraction extraction) {
        return extraction.expressionTree() instanceof ExpressionNode.ColumnRef;
    }

    private static String aliasName(Alias alias, String fallback) {
        if (alias != null && alias.getName() != null && !alias.getName().isBlank()) {
            return alias.getName();
        }
        return fallback;
    }

    private static boolean expressionEquals(ExpressionNode left, ExpressionNode right) {
        return Objects.equals(left, right);
    }

    private static String[] splitSchema(String tableName) {
        if (tableName == null || !tableName.contains(".")) {
            return new String[] {null, tableName};
        }
        String[] parts = tableName.split("\\.", 2);
        return new String[] {parts[0], parts[1]};
    }
}
