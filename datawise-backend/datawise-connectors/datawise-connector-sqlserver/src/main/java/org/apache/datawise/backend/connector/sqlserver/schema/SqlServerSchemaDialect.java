package org.apache.datawise.backend.connector.sqlserver.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.jdbc.support.SqlServerCatalogSupport;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.Locale;
import java.util.Set;

public class SqlServerSchemaDialect implements SchemaDialect {

    private static final Set<String> SYSTEM_CATALOGS = Set.of(
            "master", "tempdb", "model", "msdb"
    );

    @Override
    public String id() {
        return DbType.SQLSERVER.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.isSqlServerFamily(dbType);
    }

    @Override
    public boolean usesCatalogSchemaHierarchy() {
        return true;
    }

    @Override
    public void prepareCatalogConnection(Connection connection, String catalog) throws SQLException {
        SqlServerCatalogSupport.applyCatalog(connection, catalog);
    }

    @Override
    public SchemaScope resolveScope(Connection connection, String catalogLabel) {
        return new SchemaScope(catalogLabel, "%", catalogLabel);
    }

    @Override
    public SchemaScope resolveScope(Connection connection, String catalog, String schema) throws SQLException {
        String schemaPattern = schema != null && !schema.isBlank() ? schema.trim() : "dbo";
        return new SchemaScope(catalog, schemaPattern, catalog);
    }

    @Override
    public boolean isSystemCatalog(String catalog) {
        return catalog != null && SYSTEM_CATALOGS.contains(catalog.toLowerCase(Locale.ROOT));
    }

    @Override
    public boolean isSystemSchema(String schema) {
        return SqlServerCatalogSupport.isSystemSchema(schema);
    }
}
