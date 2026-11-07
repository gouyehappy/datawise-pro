package org.apache.datawise.backend.metadata;

import java.util.List;

public record IndexDefinition(
        String name,
        boolean unique,
        List<String> columnNames,
        String indexType) {
}
