package org.apache.datawise.backend.schema;

import java.sql.Connection;

/**
 * 各数据库在 JDBC {@link java.sql.DatabaseMetaData} 上的 catalog/schema 映射差异。
 */
public interface SchemaDialect {

    String id();

    boolean supports(String dbType);

    SchemaScope resolveScope(Connection connection, String catalogLabel) throws java.sql.SQLException;

    default boolean isSystemCatalog(String catalog) {
        return false;
    }

    default boolean isSystemSchema(String schema) {
        return false;
    }

    /** Trino / Presto / Hive / SQL Server：Explorer 树为 catalog → schema → table。 */
    default boolean usesCatalogSchemaHierarchy() {
        return false;
    }

    /** Switches JDBC connection to catalog context before listing schemas (e.g. SQL Server {@code USE}). */
    default void prepareCatalogConnection(Connection connection, String catalog) throws java.sql.SQLException {
    }

    default SchemaScope resolveScope(Connection connection, String catalog, String schema) throws java.sql.SQLException {
        if (schema != null && !schema.isBlank()) {
            return new SchemaScope(catalog, schema, catalog + "." + schema);
        }
        return resolveScope(connection, catalog);
    }
}
