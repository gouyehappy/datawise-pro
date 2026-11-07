package org.apache.datawise.backend.connector.highgo;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.highgo.ddl.HighgoDdlRenderer;
import org.apache.datawise.backend.connector.highgo.parser.HighgoLogicalTypeParser;
import org.apache.datawise.backend.connector.highgo.schema.HighgoSchemaDialect;
import org.apache.datawise.backend.connector.jdbc.HighgoDataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.PostgresqlConnectorOperations;
import org.apache.datawise.backend.connector.postgresql.PostgresqlForkRegistration;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

public final class HighgoDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        HighgoSchemaDialect schema = new HighgoSchemaDialect();
        HighgoDdlRenderer ddl = new HighgoDdlRenderer();
        PostgresqlConnectorOperations postgresql = PostgresqlForkRegistration.connectorOps(schema, ddl);
        return new HighgoDataSourceConnector(context.jdbc(), postgresql);
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return PostgresqlForkRegistration.contributions(
                DbType.HIGHGO,
                22,
                new HighgoSchemaDialect(),
                new HighgoDdlRenderer(),
                new HighgoLogicalTypeParser()
        );
    }
}
