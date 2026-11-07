package org.apache.datawise.backend.schema.spi;

import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;

import java.sql.Connection;
import java.util.Objects;

/**
 * Canonical non-paged Explorer listing inputs.
 * <p>Frozen contract: add fields only with default-compatible constructors; do not add
 * per-engine parameters to SPI method signatures.
 */
public record ExplorerListRequest(
        Connection connection,
        String connectionId,
        String catalog,
        String schema,
        String dbType,
        SchemaScope scope,
        SchemaDialect dialect) {

    public ExplorerListRequest {
        Objects.requireNonNull(connection, "connection");
        connectionId = connectionId != null ? connectionId : "";
        dbType = dbType != null ? dbType : "";
    }

    public static ExplorerListRequest of(
                                         Connection connection,
                                         String connectionId,
                                         String catalog,
                                         String schema,
                                         String dbType) {
        return new ExplorerListRequest(connection, connectionId, catalog, schema, dbType, null, null);
    }

    public ExplorerListRequest withScope(SchemaScope scope, SchemaDialect dialect) {
        return new ExplorerListRequest(connection, connectionId, catalog, schema, dbType, scope, dialect);
    }
}
