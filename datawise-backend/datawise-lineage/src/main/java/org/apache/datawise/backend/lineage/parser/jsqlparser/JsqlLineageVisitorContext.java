package org.apache.datawise.backend.lineage.parser.jsqlparser;

import net.sf.jsqlparser.schema.Table;
import net.sf.jsqlparser.statement.select.FromItem;
import net.sf.jsqlparser.statement.select.Join;
import net.sf.jsqlparser.statement.select.ParenthesedFromItem;
import org.apache.datawise.backend.lineage.model.ColumnLineage;
import org.apache.datawise.backend.lineage.model.LineageWarning;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

final class JsqlLineageVisitorContext {

    private final String connectionId;
    private final String database;
    private final List<LineageWarning> warnings;
    private final Deque<JsqlScopeFrame> scopeStack = new ArrayDeque<>();
    private final Deque<Map<String, List<ColumnLineage>>> cteStack = new ArrayDeque<>();

    JsqlLineageVisitorContext(String connectionId, String database, List<LineageWarning> warnings) {
        this.connectionId = connectionId;
        this.database = database;
        this.warnings = warnings;
    }

    String connectionId() {
        return connectionId;
    }

    String database() {
        return database;
    }

    List<LineageWarning> warnings() {
        return warnings;
    }

    void pushScope() {
        scopeStack.push(new JsqlScopeFrame());
    }

    void popScope() {
        if (scopeStack.isEmpty()) {
            throw new IllegalStateException("Scope stack underflow");
        }
        scopeStack.pop();
    }

    JsqlScopeFrame currentScope() {
        if (scopeStack.isEmpty()) {
            throw new IllegalStateException("No active scope");
        }
        return scopeStack.peek();
    }

    void pushCteScope() {
        cteStack.push(new HashMap<>());
    }

    void popCteScope() {
        if (cteStack.isEmpty()) {
            throw new IllegalStateException("CTE stack underflow");
        }
        cteStack.pop();
    }

    void registerCte(String name, List<ColumnLineage> outputs) {
        if (name == null || name.isBlank()) {
            return;
        }
        ensureCteScope().put(normalize(name), List.copyOf(outputs));
    }

    Optional<List<ColumnLineage>> resolveCte(String name) {
        if (name == null || name.isBlank()) {
            return Optional.empty();
        }
        String normalized = normalize(name);
        for (Map<String, List<ColumnLineage>> scope : cteStack) {
            List<ColumnLineage> outputs = scope.get(normalized);
            if (outputs != null) {
                return Optional.of(outputs);
            }
        }
        return Optional.empty();
    }

    Optional<ColumnLineage> resolveDerivedColumn(String tableQualifier, String columnName) {
        if (tableQualifier == null || tableQualifier.isBlank()) {
            return Optional.empty();
        }
        return currentScope()
                .resolveRelation(tableQualifier)
                .filter(JsqlRelationBinding::isDerived)
                .flatMap(binding -> binding.findOutputColumn(columnName));
    }

    private Map<String, List<ColumnLineage>> ensureCteScope() {
        if (cteStack.isEmpty()) {
            cteStack.push(new HashMap<>());
        }
        return cteStack.peek();
    }

    private static String normalize(String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }
}
