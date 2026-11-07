package org.apache.datawise.backend.connector.postgresql;

import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.PostgresqlConnectorOperations;
import org.apache.datawise.backend.connector.jdbc.PostgresqlDataSourceConnector;
import org.apache.datawise.backend.connector.postgresql.ddl.PostgresqlDdlRenderer;
import org.apache.datawise.backend.connector.postgresql.dml.PostgresqlFamilyDmlDialect;
import org.apache.datawise.backend.connector.postgresql.ops.PostgresqlFamilyDatabaseOps;
import org.apache.datawise.backend.connector.postgresql.parser.PostgresqlLogicalTypeParser;
import org.apache.datawise.backend.connector.postgresql.schema.PostgresqlSchemaDialect;
import org.apache.datawise.backend.connector.postgresql.support.PostgresqlTableIntrospector;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

import java.util.List;

public final class PostgresqlDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        PostgresqlSchemaDialect dialect = new PostgresqlSchemaDialect();
        PostgresqlDdlRenderer renderer = new PostgresqlDdlRenderer();
        PostgresqlTableIntrospector introspector = new PostgresqlTableIntrospector(dialect, renderer);
        PostgresqlConnectorOperations postgresql = new PostgresqlConnectorOperations(introspector, renderer);
        return new PostgresqlDataSourceConnector(context.jdbc(), postgresql);
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return new ConnectorDialectContributions(
                List.of(new PostgresqlDdlRenderer()),
                List.of(new PostgresqlLogicalTypeParser()),
                List.of(new PostgresqlSchemaDialect()),
                List.of(new PostgresqlTableIntrospector(new PostgresqlSchemaDialect(), new PostgresqlDdlRenderer())),
                List.of(new PostgresqlFamilyDmlDialect()),
                List.of(new PostgresqlFamilyDatabaseOps()),
                List.of(new PostgresqlFamilyDatabaseOps()),
                List.of(new PostgresqlFamilyDatabaseOps()),
                List.of(),
                List.of()
        );
    }
}
