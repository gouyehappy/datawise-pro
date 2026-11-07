package org.apache.datawise.backend.jdbc.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.schema.CatalogSchemaScope;
import org.apache.datawise.backend.schema.CatalogSchemaSession;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.SQLTransientConnectionException;
import java.util.Objects;

/**
 * Applies API {@code database} scope to a JDBC connection: PostgreSQL schema,
 * {@code catalog.schema} instance keys (Trino/Hive/SQL Server), or plain catalog.
 */
public final class DatabaseScopeSwitcher {

    private DatabaseScopeSwitcher() {
    }

    public static void apply(Connection connection, String dbType, String database) throws SQLException {
        if (database == null || database.isBlank()) {
            return;
        }
        if (connection.isClosed()) {
            throw new SQLTransientConnectionException("Connection is closed");
        }
        String normalized = DbType.normalizeId(dbType);
        if (!DbType.isSqlServerFamily(normalized) && isAlreadyApplied(connection, normalized, database)) {
            return;
        }
        if (DbType.isPostgresqlFamily(normalized)) {
            connection.setSchema(database.trim());
            return;
        }
        if (DbType.usesCatalogSchemaInstanceKey(normalized)) {
            CatalogSchemaScope scope = CatalogSchemaScope.parse(database);
            CatalogSchemaSession.apply(
                    connection,
                    scope,
                    DbType.isSqlServerFamily(normalized)
                            ? SqlServerCatalogSupport::applyCatalog
                            : Connection::setCatalog
            );
            return;
        }
        connection.setCatalog(database.trim());
    }

    public static boolean isAlreadyApplied(Connection connection, String dbType, String database)
            throws SQLException {
        if (database == null || database.isBlank()) {
            return true;
        }
        String normalized = DbType.normalizeId(dbType);
        String trimmed = database.trim();
        if (DbType.isPostgresqlFamily(normalized)) {
            return Objects.equals(trimmed, connection.getSchema());
        }
        if (DbType.usesCatalogSchemaInstanceKey(normalized)) {
            return CatalogSchemaSession.isApplied(connection, CatalogSchemaScope.parse(database));
        }
        return Objects.equals(trimmed, connection.getCatalog());
    }
}
