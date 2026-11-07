package org.apache.datawise.backend.lineage.parser.jsqlparser;

import net.sf.jsqlparser.schema.Table;
import net.sf.jsqlparser.statement.select.FromItem;
import net.sf.jsqlparser.statement.select.Join;
import net.sf.jsqlparser.statement.select.ParenthesedFromItem;

import java.util.Optional;

/**
 * Facade over the active {@link JsqlScopeFrame} for expression-level column resolution.
 */
final class JsqlScopeContext {

    enum SourceKind {
        TABLE,
        CTE
    }

    private final JsqlLineageVisitorContext visitorContext;

    JsqlScopeContext(JsqlLineageVisitorContext visitorContext) {
        this.visitorContext = visitorContext;
    }

    String resolveTableName(String qualifier) {
        if (qualifier == null || qualifier.isBlank()) {
            return null;
        }
        JsqlScopeFrame scope = visitorContext.currentScope();
        Optional<JsqlRelationBinding> binding = scope.resolveRelation(qualifier);
        if (binding.isPresent()) {
            return binding.get().tableName();
        }
        return visitorContext.resolveCte(qualifier)
                .map(outputs -> qualifier)
                .orElse(null);
    }

    SourceKind tableKind(String tableName) {
        return visitorContext.currentScope().tableKind(tableName);
    }

    Optional<org.apache.datawise.backend.lineage.model.ColumnLineage> resolveDerivedColumn(
            String tableQualifier,
            String columnName
    ) {
        return visitorContext.resolveDerivedColumn(tableQualifier, columnName);
    }

    Optional<JsqlRelationBinding> resolveRelation(String qualifier) {
        return visitorContext.currentScope().resolveRelation(qualifier);
    }

    Optional<org.apache.datawise.backend.lineage.model.ColumnLineage> resolveUnqualifiedColumn(String columnName) {
        return visitorContext.currentScope().resolveUnqualifiedColumn(columnName);
    }

    Optional<String> resolveSinglePhysicalTableName() {
        return visitorContext.currentScope().resolveSinglePhysicalTableName();
    }

    void registerFromItem(FromItem fromItem) {
        if (fromItem == null) {
            return;
        }
        if (fromItem instanceof Table table) {
            registerTableReference(table);
            return;
        }
        if (fromItem instanceof ParenthesedFromItem parenthesed) {
            registerFromItem(parenthesed.getFromItem());
            if (parenthesed.getJoins() != null) {
                for (Join join : parenthesed.getJoins()) {
                    registerJoin(join);
                }
            }
        }
    }

    void registerJoin(Join join) {
        if (join == null) {
            return;
        }
        registerFromItem(join.getFromItem());
    }

    void registerPhysicalTable(String tableName, String alias) {
        visitorContext.currentScope().registerPhysicalTable(tableName, alias);
    }

    void registerDerivedRelation(JsqlRelationBinding.Kind kind, String alias, java.util.List<org.apache.datawise.backend.lineage.model.ColumnLineage> outputs) {
        visitorContext.currentScope().registerDerived(kind, alias, outputs);
    }

    private void registerTableReference(Table table) {
        String tableName = tableFullyQualified(table);
        String alias = tableAlias(table);
        if (visitorContext.resolveCte(table.getName()).isPresent()) {
            visitorContext.resolveCte(table.getName()).ifPresent(outputs ->
                    visitorContext.currentScope().registerDerived(JsqlRelationBinding.Kind.CTE, alias, outputs));
            return;
        }
        visitorContext.currentScope().registerPhysicalTable(tableName, alias);
    }

    private static String tableFullyQualified(Table table) {
        if (table == null) {
            return null;
        }
        StringBuilder builder = new StringBuilder();
        if (table.getSchemaName() != null && !table.getSchemaName().isBlank()) {
            builder.append(table.getSchemaName()).append('.');
        }
        builder.append(table.getName());
        return builder.toString();
    }

    private static String tableAlias(Table table) {
        if (table.getAlias() != null && table.getAlias().getName() != null) {
            return table.getAlias().getName();
        }
        return table.getName();
    }
}
