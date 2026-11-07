package org.apache.datawise.backend.connector.gaussdb;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.gaussdb.ddl.GaussdbDdlRenderer;
import org.apache.datawise.backend.connector.gaussdb.parser.GaussdbLogicalTypeParser;
import org.apache.datawise.backend.connector.gaussdb.schema.GaussdbSchemaDialect;
import org.apache.datawise.backend.connector.jdbc.GaussdbDataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.PostgresqlConnectorOperations;
import org.apache.datawise.backend.connector.postgresql.PostgresqlForkRegistration;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

public final class GaussdbDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        GaussdbSchemaDialect schema = new GaussdbSchemaDialect();
        GaussdbDdlRenderer ddl = new GaussdbDdlRenderer();
        PostgresqlConnectorOperations postgresql = PostgresqlForkRegistration.connectorOps(schema, ddl);
        return new GaussdbDataSourceConnector(context.jdbc(), postgresql);
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return PostgresqlForkRegistration.contributions(
                DbType.GAUSSDB,
                22,
                new GaussdbSchemaDialect(),
                new GaussdbDdlRenderer(),
                new GaussdbLogicalTypeParser()
        );
    }
}
