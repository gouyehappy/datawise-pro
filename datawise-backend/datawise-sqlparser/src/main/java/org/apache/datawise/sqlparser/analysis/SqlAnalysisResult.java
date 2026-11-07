package org.apache.datawise.sqlparser.analysis;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Mutable collector populated by analysis handlers during a single AST walk. */
public final class SqlAnalysisResult {

    private final Set<String> tables = new LinkedHashSet<>();
    private final Map<String, String> aliasToTable = new LinkedHashMap<>();
    private final List<QualifiedColumn> qualifiedColumns = new ArrayList<>();
    private final Set<String> selectAliases = new LinkedHashSet<>();
    private final Set<String> unqualifiedColumns = new LinkedHashSet<>();

    public Set<String> tables() {
        return tables;
    }

    public Map<String, String> aliasToTable() {
        return aliasToTable;
    }

    public List<QualifiedColumn> qualifiedColumns() {
        return qualifiedColumns;
    }

    Set<String> selectAliases() {
        return selectAliases;
    }

    public Set<String> unqualifiedColumns() {
        return unqualifiedColumns;
    }

    public void addTable(String table) {
        if (table != null && !table.isBlank() && !isKeyword(table)) {
            tables.add(table);
        }
    }

    public void addAlias(String alias, String table) {
        if (table == null || table.isBlank()) {
            return;
        }
        String normalizedTable = table.toLowerCase(Locale.ROOT);
        String normalizedAlias = alias == null || alias.isBlank()
                ? normalizedTable
                : alias.toLowerCase(Locale.ROOT);
        aliasToTable.put(normalizedAlias, normalizedTable);
        aliasToTable.put(normalizedTable, normalizedTable);
    }

    public void addQualifiedColumn(String tableOrAlias, String column) {
        if (column == null || column.isBlank() || "*".equals(column)) {
            return;
        }
        qualifiedColumns.add(new QualifiedColumn(tableOrAlias, column));
    }

    public void addSelectAlias(String alias) {
        if (alias != null && !alias.isBlank()) {
            selectAliases.add(alias.toLowerCase(Locale.ROOT));
        }
    }

    public void addUnqualifiedColumn(String column) {
        if (column == null || column.isBlank()) {
            return;
        }
        String normalized = column.toLowerCase(Locale.ROOT);
        if (selectAliases.contains(normalized) || aliasToTable.containsKey(normalized)) {
            return;
        }
        unqualifiedColumns.add(normalized);
    }

    private static boolean isKeyword(String token) {
        return switch (token.toLowerCase(Locale.ROOT)) {
            case "select", "where", "on", "lateral" -> true;
            default -> false;
        };
    }
}
