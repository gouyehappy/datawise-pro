package org.apache.datawise.backend.lineage.model;

public record LineageWarning(
        String code,
        String message,
        Integer line,
        Integer column
) {
    public static LineageWarning of(String code, String message) {
        return new LineageWarning(code, message, null, null);
    }
}
