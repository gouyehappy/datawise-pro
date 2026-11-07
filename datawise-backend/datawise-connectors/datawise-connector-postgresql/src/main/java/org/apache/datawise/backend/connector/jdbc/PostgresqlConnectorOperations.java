package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.operation.ConnectorDdlOperations;
import org.apache.datawise.backend.connector.operation.ConnectorMetadataOperations;
import org.apache.datawise.backend.connector.postgresql.ddl.PostgresqlDdlRenderer;
import org.apache.datawise.backend.ddl.DdlRenderOptions;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.metadata.TableDefinition;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.sql.Connection;
import java.sql.SQLException;

public class PostgresqlConnectorOperations implements ConnectorMetadataOperations, ConnectorDdlOperations {

    private final TableMetadataIntrospection tableIntrospector;
    private final PostgresqlDdlRenderer postgresqlDdlRenderer;

    public PostgresqlConnectorOperations(
            TableMetadataIntrospection tableIntrospector,
            PostgresqlDdlRenderer postgresqlDdlRenderer
    ) {
        this.tableIntrospector = tableIntrospector;
        this.postgresqlDdlRenderer = postgresqlDdlRenderer;
    }

    @Override
    public TablePropertiesResult loadProperties(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String tableName
    ) throws SQLException {
        return tableIntrospector.loadProperties(connection, entity, database, tableName);
    }

    @Override
    public TableDefinition extractTableDefinition(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String tableName
    ) throws SQLException {
        return tableIntrospector.extractTableDefinition(connection, entity, database, tableName);
    }

    @Override
    public TableDdlResult loadDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String tableName
    ) throws SQLException {
        return tableIntrospector.loadDdl(connection, entity, database, tableName);
    }

    @Override
    public String renderCreateTable(TableDefinition definition, DdlRenderOptions options) {
        return postgresqlDdlRenderer.renderCreateTable(definition, options != null ? options : DdlRenderOptions.defaults());
    }
}
