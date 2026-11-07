package org.apache.datawise.backend.domain;

import java.util.Locale;

/** JDBC relation kind for table vs database view metadata. */
public enum RelationKind {

    TABLE,
    VIEW;

    public static RelationKind parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return TABLE;
        }
        return "view".equalsIgnoreCase(raw.trim()) ? VIEW : TABLE;
    }

    public String queryValue() {
        return this == VIEW ? "view" : "table";
    }

    @Override
    public String toString() {
        return name().toLowerCase(Locale.ROOT);
    }
}
