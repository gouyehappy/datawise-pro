package org.apache.datawise.backend.connector.phoenix.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;

import java.sql.Connection;
import java.util.Locale;
import java.util.Set;

public final class PhoenixSchemaDialect implements SchemaDialect {

    private static final Set<String> SYSTEM_SCHEMAS = Set.of(
            "SYSTEM", "INFORMATION_SCHEMA"
    );

    @Override
    public String id() {
        return DbType.PHOENIX.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.PHOENIX.matches(dbType);
    }

    @Override
    public SchemaScope resolveScope(Connection connection, String catalogLabel) {
        return new SchemaScope(catalogLabel, catalogLabel, catalogLabel);
    }

    @Override
    public boolean isSystemSchema(String schema) {
        if (schema == null || schema.isBlank()) {
            return true;
        }
        return SYSTEM_SCHEMAS.contains(schema.trim().toUpperCase(Locale.ROOT));
    }
}
