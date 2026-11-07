package org.apache.datawise.backend.connector.greenplum;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.greenplum.ddl.GreenplumDdlRenderer;
import org.apache.datawise.backend.connector.greenplum.parser.GreenplumLogicalTypeParser;
import org.apache.datawise.backend.connector.greenplum.schema.GreenplumSchemaDialect;
import org.apache.datawise.backend.connector.jdbc.GreenplumDataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.PostgresqlConnectorOperations;
import org.apache.datawise.backend.connector.postgresql.PostgresqlForkRegistration;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

public final class GreenplumDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        GreenplumSchemaDialect schema = new GreenplumSchemaDialect();
        GreenplumDdlRenderer ddl = new GreenplumDdlRenderer();
        PostgresqlConnectorOperations postgresql = PostgresqlForkRegistration.connectorOps(schema, ddl);
        return new GreenplumDataSourceConnector(context.jdbc(), postgresql);
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return PostgresqlForkRegistration.contributions(
                DbType.GREENPLUM,
                22,
                new GreenplumSchemaDialect(),
                new GreenplumDdlRenderer(),
                new GreenplumLogicalTypeParser()
        );
    }
}
