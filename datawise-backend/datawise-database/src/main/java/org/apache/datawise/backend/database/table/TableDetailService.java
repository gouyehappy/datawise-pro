package org.apache.datawise.backend.database.table;

import org.apache.datawise.backend.connector.support.ConnectorCapabilityGuard;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;

import org.apache.datawise.backend.domain.RelationKind;
import org.apache.datawise.backend.domain.SchemaRelationsResult;
import org.apache.datawise.backend.domain.SchemaTablesResult;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.domain.TableRelationsResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.jdbc.error.JdbcConnectionErrors;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.SQLException;

@Service
public class TableDetailService {

    private final ConnectionExecutionContext connectionContext;
    private final ConnectorFacade connectorFacade;

    public TableDetailService(
            ConnectionExecutionContext connectionContext,
            ConnectorFacade connectorFacade
    ) {
        this.connectionContext = connectionContext;
        this.connectorFacade = connectorFacade;
    }

    public TablePropertiesResult loadProperties(String tableName, String connectionId, String database) {
        return loadRelationProperties(tableName, connectionId, database, RelationKind.TABLE);
    }

    public TablePropertiesResult loadViewProperties(String viewName, String connectionId, String database) {
        return loadRelationProperties(viewName, connectionId, database, RelationKind.VIEW);
    }

    public TablePropertiesResult loadRelationProperties(
            String relationName,
            String connectionId,
            String database,
            RelationKind kind
    ) {
        ConnectionExecutionContext.ResolvedConnectionWithConnector resolved =
                requireResolvedConnection(connectionId, database);
        if (ConnectorCapabilityGuard.hasDocumentRead(resolved.connector())) {
            return connectorFacade.document().loadCollectionProperties(
                    resolved.entity(),
                    resolved.database(),
                    relationName
            );
        }
        return withConnection(relationName, resolved, (connection, entity, resolvedDatabase, connector) ->
                connector.metadata().loadRelationProperties(
                        connection,
                        entity,
                        resolvedDatabase,
                        relationName,
                        kind
                ));
    }

    public TableRelationsResult loadRelations(String tableName, String connectionId, String database) {
        ConnectionExecutionContext.ResolvedConnectionWithConnector resolved =
                requireResolvedConnection(connectionId, database);
        if (ConnectorCapabilityGuard.hasDocumentRead(resolved.connector())) {
            return new TableRelationsResult(tableName, java.util.List.of(), java.util.List.of());
        }
        return withConnection(tableName, resolved, (connection, entity, resolvedDatabase, connector) ->
                connector.metadata().loadRelations(connection, entity, resolvedDatabase, tableName));
    }

    public SchemaRelationsResult loadSchemaRelations(String connectionId, String database) {
        ConnectionExecutionContext.ResolvedConnectionWithConnector resolved =
                requireResolvedConnection(connectionId, database);
        if (ConnectorCapabilityGuard.hasDocumentRead(resolved.connector())) {
            return new SchemaRelationsResult(resolved.database(), java.util.List.of(), java.util.List.of());
        }
        try {
            return connectorFacade.jdbc().withConnection(
                    resolved.entity(),
                    resolved.database(),
                    connection -> resolved.connector().metadata().loadSchemaRelations(
                            connection,
                            resolved.entity(),
                            resolved.database()
                    )
            );
        } catch (SQLException ex) {
            throw JdbcConnectionErrors.toServiceException(resolved.entity(), ex);
        }
    }

    public SchemaTablesResult loadSchemaTables(String connectionId, String database) {
        ConnectionExecutionContext.ResolvedConnectionWithConnector resolved =
                requireResolvedConnection(connectionId, database);
        if (ConnectorCapabilityGuard.hasDocumentRead(resolved.connector())) {
            return new SchemaTablesResult(resolved.database(), java.util.List.of());
        }
        try {
            return connectorFacade.jdbc().withConnection(
                    resolved.entity(),
                    resolved.database(),
                    connection -> resolved.connector().metadata().loadSchemaTables(
                            connection,
                            resolved.entity(),
                            resolved.database()
                    )
            );
        } catch (SQLException ex) {
            throw JdbcConnectionErrors.toServiceException(resolved.entity(), ex);
        }
    }

    public TableDdlResult loadDdl(String tableName, String connectionId, String database) {
        return loadRelationDdl(tableName, connectionId, database, RelationKind.TABLE);
    }

    public TableDdlResult loadViewDdl(String viewName, String connectionId, String database) {
        return loadRelationDdl(viewName, connectionId, database, RelationKind.VIEW);
    }

    public TableDdlResult loadRelationDdl(
            String relationName,
            String connectionId,
            String database,
            RelationKind kind
    ) {
        ConnectionExecutionContext.ResolvedConnectionWithConnector resolved =
                requireResolvedConnection(connectionId, database);
        if (ConnectorCapabilityGuard.hasDocumentRead(resolved.connector())) {
            return new TableDdlResult(
                    "-- Document store collections do not have SQL DDL.\n"
                            + "-- Collection: " + relationName + "\n"
                            + "-- Database: " + resolved.database()
            );
        }
        return withConnection(relationName, resolved, (connection, entity, resolvedDatabase, connector) ->
                connector.ddl().loadRelationDdl(connection, entity, resolvedDatabase, relationName, kind));
    }

    private ConnectionExecutionContext.ResolvedConnectionWithConnector requireResolvedConnection(
            String connectionId,
            String database
    ) {
        return connectionContext.requireAvailableWithConnectorForCurrentUser(
                connectionId,
                database,
                "Connection not found: " + connectionId
        );
    }

    private <T> T withConnection(
            String tableName,
            ConnectionExecutionContext.ResolvedConnectionWithConnector resolved,
            ConnectionCallback<T> callback
    ) {
        if (tableName == null || tableName.isBlank()) {
            throw new IllegalArgumentException("tableName is required");
        }

        try {
            return connectorFacade.jdbc().withConnection(
                    resolved.entity(),
                    resolved.database(),
                    connection -> callback.execute(
                            connection,
                            resolved.entity(),
                            resolved.database(),
                            resolved.connector()
                    )
            );
        } catch (SQLException ex) {
            throw JdbcConnectionErrors.toServiceException(resolved.entity(), ex);
        }
    }

    @FunctionalInterface
    private interface ConnectionCallback<T> {
        T execute(
                Connection connection,
                ConnectionEntity entity,
                String database,
                DataSourceConnector connector
        ) throws SQLException;
    }
}
