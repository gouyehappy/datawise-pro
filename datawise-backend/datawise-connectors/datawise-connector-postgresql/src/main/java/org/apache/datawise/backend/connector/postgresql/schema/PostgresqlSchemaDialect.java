package org.apache.datawise.backend.connector.postgresql.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;

import java.sql.Connection;
import java.util.Locale;

public class PostgresqlSchemaDialect implements SchemaDialect {

    @Override
    public String id() {
        return DbType.POSTGRESQL.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.isPostgresqlFamily(dbType);
    }

    @Override
    public SchemaScope resolveScope(Connection connection, String catalogLabel) throws java.sql.SQLException {
        String catalogPattern = connection.getCatalog();
        return new SchemaScope(catalogPattern, catalogLabel, catalogLabel);
    }

    @Override
    public boolean isSystemSchema(String schema) {
        if (schema == null) {
            return true;
        }
        String value = schema.toLowerCase(Locale.ROOT);
        return value.startsWith("pg_") || "information_schema".equals(value);
    }
}
