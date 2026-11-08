package org.apache.datawise.backend.domain;

public record TableColumnDetail(
        int ordinal,
        String name,
        String dataType,
        boolean nullable,
        boolean autoIncrement,
        String keyType,
        String defaultValue,
        String extra,
        String comment,
        String characterSet,
        String collation) {

    /** Backward-compatible constructor when per-column charset/collation are unavailable. */
    public TableColumnDetail(
                             int ordinal,
                             String name,
                             String dataType,
                             boolean nullable,
                             boolean autoIncrement,
                             String keyType,
                             String defaultValue,
                             String extra,
                             String comment) {
        this(ordinal, name, dataType, nullable, autoIncrement, keyType, defaultValue, extra, comment, null, null);
    }
}
