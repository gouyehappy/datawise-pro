package org.apache.datawise.backend.lineage.parser.jsqlparser;

import org.apache.datawise.backend.lineage.model.ColumnLineage;

import java.util.List;
import java.util.Locale;
import java.util.Optional;

final class JsqlRelationBinding {

    enum Kind {
    PHYSICAL_TABLE,
    CTE,
    SUBQUERY,
    VIEW_MODEL
    }

    private final Kind kind;
    private final String alias;
    private final String tableName;
    private final List<ColumnLineage> outputColumns;

    private JsqlRelationBinding(Kind kind, String alias, String tableName, List<ColumnLineage> outputColumns) {
        this.kind = kind;
        this.alias = alias;
        this.tableName = tableName;
        this.outputColumns = outputColumns == null ? List.of() : List.copyOf(outputColumns);
    }

    static JsqlRelationBinding physical(String tableName, String alias) {
        return new JsqlRelationBinding(Kind.PHYSICAL_TABLE, alias, tableName, List.of());
    }

    static JsqlRelationBinding derived(Kind kind, String alias, List<ColumnLineage> outputColumns) {
        return new JsqlRelationBinding(kind, alias, alias, List.copyOf(outputColumns));
    }

    Kind kind() {
        return kind;
    }

    String alias() {
        return alias;
    }

    String tableName() {
        return tableName;
    }

    boolean isDerived() {
        return kind != Kind.PHYSICAL_TABLE;
    }

    Optional<ColumnLineage> findOutputColumn(String columnName) {
        if (columnName == null || columnName.isBlank()) {
            return Optional.empty();
        }
        String normalized = normalize(columnName);
        for (ColumnLineage column : outputColumns) {
            if (normalize(column.outputColumn()).equals(normalized)) {
                return Optional.of(column);
            }
        }
        return Optional.empty();
    }

    List<ColumnLineage> findAllOutputs() {
        return outputColumns;
    }

    private static String normalize(String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }
}
