package org.apache.datawise.backend.schema;

/** Parses {@code catalog.schema} database scope (Trino / Presto / Hive / SQL Server). */
public record CatalogSchemaScope(String catalog, String schema) {

    /** Trino 连接级脚本目录（无 catalog.schema 上下文时） */
    public static final String CONNECTION_SCRIPTS = "_scripts";

    public static CatalogSchemaScope parse(String database) {
        if (database == null || database.isBlank()) {
            return new CatalogSchemaScope(null, null);
        }
        String trimmed = database.trim();
        int dot = trimmed.indexOf('.');
        if (dot <= 0 || dot >= trimmed.length() - 1) {
            return new CatalogSchemaScope(trimmed, null);
        }
        return new CatalogSchemaScope(trimmed.substring(0, dot), trimmed.substring(dot + 1));
    }

    public boolean hasSchema() {
        return schema != null && !schema.isBlank();
    }

    public boolean isConnectionScripts() {
        return CONNECTION_SCRIPTS.equals(catalog) && !hasSchema();
    }

    /** workspaces 磁盘目录与 API instanceName（Trino: catalog.schema；MySQL: database） */
    public String instanceKey() {
        if (isConnectionScripts()) {
            return CONNECTION_SCRIPTS;
        }
        if (hasSchema()) {
            return catalog + "." + schema;
        }
        return catalog != null ? catalog : "";
    }

    public static String formatInstanceKey(String catalog, String schema) {
        if (schema != null && !schema.isBlank()) {
            return catalog + "." + schema;
        }
        return catalog;
    }
}
