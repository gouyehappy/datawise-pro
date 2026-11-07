package org.apache.datawise.backend.connector.sqlite.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;

import java.sql.Connection;

/** SQLite schema dialect: explorer database nodes map to attached database names. */
public final class SqliteSchemaDialect implements SchemaDialect {

    @Override
    public String id() {
        return DbType.SQLITE3.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.SQLITE3.matches(dbType);
    }

    @Override
    public SchemaScope resolveScope(Connection connection, String catalogLabel) {
        return new SchemaScope(catalogLabel, "main", catalogLabel);
    }
}
