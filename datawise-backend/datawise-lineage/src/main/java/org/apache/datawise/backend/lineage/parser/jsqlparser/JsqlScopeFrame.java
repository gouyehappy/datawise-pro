package org.apache.datawise.backend.lineage.parser.jsqlparser;

import org.apache.datawise.backend.lineage.model.ColumnLineage;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

final class JsqlScopeFrame {

    private final Map<String, JsqlRelationBinding> relationsByAlias = new HashMap<>();

    void registerPhysicalTable(String tableName, String alias) {
        String normalizedAlias = requireAlias(alias, tableName);
        relationsByAlias.put(normalizedAlias, JsqlRelationBinding.physical(tableName, normalizedAlias));
    }

    void registerDerived(JsqlRelationBinding.Kind kind, String alias, List<ColumnLineage> outputs) {
        String normalizedAlias = requireAlias(alias, alias);
        relationsByAlias.put(normalizedAlias, JsqlRelationBinding.derived(kind, normalizedAlias, outputs));
    }

    Optional<JsqlRelationBinding> resolveRelation(String qualifier) {
        if (qualifier == null || qualifier.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(relationsByAlias.get(normalize(qualifier)));
    }

    Optional<ColumnLineage> resolveUnqualifiedColumn(String columnName) {
        if (columnName == null || columnName.isBlank()) {
            return Optional.empty();
        }
        if (relationsByAlias.size() == 1) {
            JsqlRelationBinding only = relationsByAlias.values().iterator().next();
            if (only.isDerived()) {
                return only.findOutputColumn(columnName);
            }
            return Optional.empty();
        }
        List<ColumnLineage> matches = new ArrayList<>();
        for (JsqlRelationBinding binding : relationsByAlias.values()) {
            if (binding.isDerived()) {
                binding.findOutputColumn(columnName).ifPresent(matches::add);
            }
        }
        if (matches.size() == 1) {
            return Optional.of(matches.get(0));
        }
        return Optional.empty();
    }

    Optional<String> resolveSinglePhysicalTableName() {
        if (relationsByAlias.size() != 1) {
            return Optional.empty();
        }
        JsqlRelationBinding only = relationsByAlias.values().iterator().next();
        if (only.isDerived()) {
            return Optional.empty();
        }
        return Optional.ofNullable(only.tableName());
    }

    JsqlScopeContext.SourceKind tableKind(String tableName) {
        if (tableName == null) {
            return JsqlScopeContext.SourceKind.TABLE;
        }
        return resolveRelation(tableName)
                .map(binding -> switch (binding.kind()) {
                    case CTE -> JsqlScopeContext.SourceKind.CTE;
                    case SUBQUERY -> JsqlScopeContext.SourceKind.CTE;
                    case VIEW_MODEL -> JsqlScopeContext.SourceKind.CTE;
                    case PHYSICAL_TABLE -> JsqlScopeContext.SourceKind.TABLE;
                })
                .orElse(JsqlScopeContext.SourceKind.TABLE);
    }

    private static String requireAlias(String alias, String fallback) {
        String value = alias != null && !alias.isBlank() ? alias : fallback;
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Relation alias is required");
        }
        return normalize(value);
    }

    private static String normalize(String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }

    List<JsqlRelationBinding> allRelations() {
        return List.copyOf(relationsByAlias.values());
    }
}
