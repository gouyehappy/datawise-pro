package org.apache.datawise.backend.connector.hive.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.Locale;
import java.util.Set;

public class HiveSchemaDialect implements SchemaDialect {

    private static final Set<String> SYSTEM_SCHEMAS = Set.of(
            "information_schema", "sys"
    );

    @Override
    public String id() {
        return DbType.HIVE.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.HIVE.id().equals(DbType.normalizeId(dbType));
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
    public boolean isSystemSchema(String schema) {
        return schema != null && SYSTEM_SCHEMAS.contains(schema.toLowerCase(Locale.ROOT));
    }
}
