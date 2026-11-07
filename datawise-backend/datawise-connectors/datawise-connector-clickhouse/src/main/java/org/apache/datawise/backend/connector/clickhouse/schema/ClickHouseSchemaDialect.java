package org.apache.datawise.backend.connector.clickhouse.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;

import java.sql.Connection;
import java.util.Locale;
import java.util.Set;

/** ClickHouse schema dialect: explorer database nodes map to ClickHouse databases. */
public class ClickHouseSchemaDialect implements SchemaDialect {

    private static final Set<String> SYSTEM_DATABASES = Set.of(
            "system",
            "information_schema",
            "_temporary_and_external_tables"
    );

    @Override
    public String id() {
        return DbType.CLICKHOUSE.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.CLICKHOUSE.matches(dbType);
    }

    @Override
    public SchemaScope resolveScope(Connection connection, String catalogLabel) {
        return new SchemaScope(catalogLabel, null, catalogLabel);
    }

    @Override
    public boolean isSystemCatalog(String catalog) {
        return isSystemDatabase(catalog);
    }

    @Override
    public boolean isSystemSchema(String schema) {
        return isSystemDatabase(schema);
    }

    private static boolean isSystemDatabase(String name) {
        if (name == null || name.isBlank()) {
            return true;
        }
        return SYSTEM_DATABASES.contains(name.trim().toLowerCase(Locale.ROOT));
    }
}
