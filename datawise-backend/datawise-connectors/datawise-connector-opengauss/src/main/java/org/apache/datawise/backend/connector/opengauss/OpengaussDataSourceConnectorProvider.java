package org.apache.datawise.backend.connector.opengauss;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.OpengaussDataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.PostgresqlConnectorOperations;
import org.apache.datawise.backend.connector.opengauss.ddl.OpengaussDdlRenderer;
import org.apache.datawise.backend.connector.opengauss.parser.OpengaussLogicalTypeParser;
import org.apache.datawise.backend.connector.opengauss.schema.OpengaussSchemaDialect;
import org.apache.datawise.backend.connector.postgresql.PostgresqlForkRegistration;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

public final class OpengaussDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        OpengaussSchemaDialect schema = new OpengaussSchemaDialect();
        OpengaussDdlRenderer ddl = new OpengaussDdlRenderer();
        PostgresqlConnectorOperations postgresql = PostgresqlForkRegistration.connectorOps(schema, ddl);
        return new OpengaussDataSourceConnector(context.jdbc(), postgresql);
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return PostgresqlForkRegistration.contributions(
                DbType.OPENGAUSS,
                22,
                new OpengaussSchemaDialect(),
                new OpengaussDdlRenderer(),
                new OpengaussLogicalTypeParser()
        );
    }
}
