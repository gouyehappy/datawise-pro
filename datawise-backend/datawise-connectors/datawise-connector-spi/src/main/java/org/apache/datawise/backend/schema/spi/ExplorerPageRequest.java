package org.apache.datawise.backend.schema.spi;

import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;

import java.sql.Connection;
import java.util.Objects;

/**
 * Canonical paged Explorer listing inputs (offset/limit + optional name pattern).
 * <p>Used by views, routines, and fast table listing. Frozen contract — extend via new
 * optional fields with defaults, never via new SPI method parameters.
 */
public record ExplorerPageRequest(
        Connection connection,
        String connectionId,
        String catalog,
        String schema,
        String dbType,
        SchemaScope scope,
        SchemaDialect dialect,
        int offset,
        int limit,
        String namePattern,
        boolean skeleton) {

    public ExplorerPageRequest {
        Objects.requireNonNull(connection, "connection");
        connectionId = connectionId != null ? connectionId : "";
        dbType = dbType != null ? dbType : "";
        offset = Math.max(0, offset);
        limit = Math.max(1, limit);
    }

    public static ExplorerPageRequest of(
                                         Connection connection,
                                         String connectionId,
                                         String catalog,
                                         String schema,
                                         String dbType,
                                         int offset,
                                         int limit,
                                         String namePattern) {
        return new ExplorerPageRequest(
                connection, connectionId, catalog, schema, dbType,
                null, null, offset, limit, namePattern, true);
    }

    public static ExplorerPageRequest of(
                                         Connection connection,
                                         String connectionId,
                                         String catalog,
                                         String schema,
                                         String dbType,
                                         SchemaScope scope,
                                         SchemaDialect dialect,
                                         int offset,
                                         int limit,
                                         boolean skeleton,
                                         String namePattern) {
        return new ExplorerPageRequest(
                connection, connectionId, catalog, schema, dbType,
                scope, dialect, offset, limit, namePattern, skeleton);
    }

    public ExplorerListRequest toListRequest() {
        return new ExplorerListRequest(connection, connectionId, catalog, schema, dbType, scope, dialect);
    }

    public ExplorerPageRequest withScope(SchemaScope scope, SchemaDialect dialect) {
        return new ExplorerPageRequest(
                connection, connectionId, catalog, schema, dbType,
                scope, dialect, offset, limit, namePattern, skeleton);
    }
}
