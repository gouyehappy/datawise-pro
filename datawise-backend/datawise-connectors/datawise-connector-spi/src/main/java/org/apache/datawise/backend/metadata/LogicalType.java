package org.apache.datawise.backend.metadata;

import java.util.Map;

public record LogicalType(
        LogicalTypeKind kind,
        Integer length,
        Integer precision,
        Integer scale,
        boolean unsigned,
        String rawTypeName,
        Map<String, String> attributes) {

    public LogicalType {
        attributes = attributes != null ? Map.copyOf(attributes) : Map.of();
    }

    public static LogicalType unknown(String rawTypeName) {
        return new LogicalType(LogicalTypeKind.UNKNOWN, null, null, null, false, rawTypeName, Map.of());
    }

    public static LogicalType varchar(int length) {
        return new LogicalType(LogicalTypeKind.VARCHAR, length, null, null, false, null, Map.of());
    }
}
