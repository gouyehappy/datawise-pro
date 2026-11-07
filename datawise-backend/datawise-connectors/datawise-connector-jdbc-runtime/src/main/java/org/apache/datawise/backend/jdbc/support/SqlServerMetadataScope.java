package org.apache.datawise.backend.jdbc.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.schema.CatalogSchemaScope;

import java.sql.Connection;
import java.sql.SQLException;

/**
 * SQL Server metadata scope: catalog (database) → schema → object.
 * Mirrors Trino/Presto {@code catalog.schema} instance keys for Explorer, DDL, and JDBC listing.
 */
public record SqlServerMetadataScope(String catalog, String schema) {

    public static SqlServerMetadataScope parse(String database) {
        CatalogSchemaScope scope = CatalogSchemaScope.parse(database);
        String catalog = scope.catalog() != null ? scope.catalog().trim() : "";
        String schema = scope.hasSchema() ? scope.schema().trim() : null;
        return new SqlServerMetadataScope(catalog, schema);
    }

    public boolean hasCatalog() {
        return catalog != null && !catalog.isBlank();
    }

    public boolean hasSchema() {
        return schema != null && !schema.isBlank();
    }

    /** Explorer / workspace instance key ({@code mydb.dbo}). */
    public String instanceKey() {
        if (!hasCatalog()) {
            return "";
        }
        return CatalogSchemaScope.formatInstanceKey(catalog, schema);
    }

    /** {@code USE [catalog]} and optional JDBC default schema. */
    public void apply(Connection connection) throws SQLException {
        if (!hasCatalog()) {
            throw new IllegalArgumentException("SQL Server database (catalog) is required");
        }
        SqlServerCatalogSupport.applyCatalog(connection, catalog);
        if (hasSchema()) {
            connection.setSchema(schema);
        }
    }

    /** When schema was omitted (catalog-only scope), resolve dbo or JDBC default schema. */
    public SqlServerMetadataScope withResolvedSchema(Connection connection) throws SQLException {
        if (hasSchema()) {
            return this;
        }
        return new SqlServerMetadataScope(catalog, SqlServerCatalogSupport.defaultSchema(connection));
    }

    /** Three-part name {@code [catalog].[schema].[object]} for OBJECT_ID / DDL. */
    public String qualifyObject(String objectName) {
        String effectiveSchema = hasSchema() ? schema : "dbo";
        if (!hasCatalog()) {
            return DbType.SQLSERVER.quoteName(effectiveSchema)
                    + "." + DbType.SQLSERVER.quoteName(objectName);
        }
        return DbType.SQLSERVER.quoteName(catalog)
                + "." + DbType.SQLSERVER.quoteName(effectiveSchema)
                + "." + DbType.SQLSERVER.quoteName(objectName);
    }

    public String qualifiedLabel(String objectName) {
        String effectiveSchema = hasSchema() ? schema : "dbo";
        if (!hasCatalog()) {
            return effectiveSchema + "." + objectName;
        }
        return catalog + "." + effectiveSchema + "." + objectName;
    }
}
