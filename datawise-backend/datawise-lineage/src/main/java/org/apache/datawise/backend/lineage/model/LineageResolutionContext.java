package org.apache.datawise.backend.lineage.model;

import org.apache.datawise.backend.lineage.spi.SchemaCatalog;

import java.util.Locale;
import java.util.Map;
import java.util.Set;

public record LineageResolutionContext(
        SchemaCatalog schema,
        Map<String, String> viewModelNames
) {
    public LineageResolutionContext {
        schema = schema == null ? SchemaCatalog.EMPTY : schema;
        viewModelNames = viewModelNames == null ? Map.of() : Map.copyOf(viewModelNames);
    }

    public static LineageResolutionContext empty() {
        return new LineageResolutionContext(SchemaCatalog.EMPTY, Map.of());
    }

    public boolean isViewModel(String tableName) {
        if (tableName == null || tableName.isBlank()) {
            return false;
        }
        return viewModelNames.containsKey(normalize(tableName));
    }

    public String viewModelFileName(String tableName) {
        if (tableName == null || tableName.isBlank()) {
            return null;
        }
        return viewModelNames.get(normalize(tableName));
    }

    public Set<String> viewModelDisplayNames() {
        return Set.copyOf(viewModelNames.keySet());
    }

    private static String normalize(String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }
}
