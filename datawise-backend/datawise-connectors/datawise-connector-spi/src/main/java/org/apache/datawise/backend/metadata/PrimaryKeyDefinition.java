package org.apache.datawise.backend.metadata;

import java.util.List;

public record PrimaryKeyDefinition(String name, List<String> columnNames) {
}
