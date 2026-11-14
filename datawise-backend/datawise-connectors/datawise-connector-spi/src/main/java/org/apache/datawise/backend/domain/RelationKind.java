package org.apache.datawise.backend.domain;

import java.util.Locale;

/** JDBC relation kind for table / view / trigger / routine / sequence metadata and DDL. */
public enum RelationKind {

    TABLE,
    VIEW,
    /** MetaForge B1：触发器 DDL / 详情。 */
    TRIGGER,
    /** MetaForge B1：函数 DDL。 */
    FUNCTION,
    /** MetaForge B1：存储过程 DDL。 */
    PROCEDURE,
    /** MetaForge B1：序列 DDL（PostgreSQL / Oracle / SQL Server）。 */
    SEQUENCE;

    public static RelationKind parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return TABLE;
        }
        String normalized = raw.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "view" -> VIEW;
            case "trigger" -> TRIGGER;
            case "function" -> FUNCTION;
            case "procedure", "proc" -> PROCEDURE;
            case "sequence", "seq" -> SEQUENCE;
            default -> TABLE;
        };
    }

    public String queryValue() {
        return switch (this) {
            case VIEW -> "view";
            case TRIGGER -> "trigger";
            case FUNCTION -> "function";
            case PROCEDURE -> "procedure";
            case SEQUENCE -> "sequence";
            case TABLE -> "table";
        };
    }

    public boolean isRoutine() {
        return this == FUNCTION || this == PROCEDURE;
    }

    @Override
    public String toString() {
        return name().toLowerCase(Locale.ROOT);
    }
}
