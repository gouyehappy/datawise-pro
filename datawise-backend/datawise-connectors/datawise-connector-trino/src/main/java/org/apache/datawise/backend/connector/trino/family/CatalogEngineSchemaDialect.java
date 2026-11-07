package org.apache.datawise.backend.connector.trino.family;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.Locale;
import java.util.Set;

/** Trino / Presto catalog+schema 层级 Schema 方言。 */
public class CatalogEngineSchemaDialect implements SchemaDialect {

    private static final Set<String> SYSTEM_CATALOGS = Set.of(
            "system", "jmx", "memory"
    );

    private final DbType dbType;

    public CatalogEngineSchemaDialect(DbType dbType) {
        this.dbType = dbType;
    }

    @Override
    public String id() {
        return dbType.id();
    }

    @Override
    public boolean supports(String dbType) {
        return this.dbType.id().equals(DbType.normalizeId(dbType));
    }

    @Override
    public boolean usesCatalogSchemaHierarchy() {
        return true;
    }

    @Override
    public SchemaScope resolveScope(Connection connection, String catalogLabel) throws SQLException {
        String schema = connection.getSchema();
        if (schema == null || schema.isBlank()) {
            schema = "%";
        }
        return new SchemaScope(catalogLabel, schema, catalogLabel);
    }

    @Override
    public SchemaScope resolveScope(Connection connection, String catalog, String schema) throws SQLException {
        String schemaPattern = schema != null && !schema.isBlank() ? schema : "%";
        return new SchemaScope(catalog, schemaPattern, catalog + "." + schemaPattern);
    }

    @Override
    public boolean isSystemCatalog(String catalog) {
        return catalog != null && SYSTEM_CATALOGS.contains(catalog.toLowerCase(Locale.ROOT));
    }

    @Override
    public boolean isSystemSchema(String schema) {
        return schema != null && "information_schema".equalsIgnoreCase(schema);
    }
}
