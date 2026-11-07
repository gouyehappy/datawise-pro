package org.apache.datawise.backend.connector.kingbase;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.KingbaseDataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.PostgresqlConnectorOperations;
import org.apache.datawise.backend.connector.kingbase.ddl.KingbaseDdlRenderer;
import org.apache.datawise.backend.connector.kingbase.parser.KingbaseLogicalTypeParser;
import org.apache.datawise.backend.connector.kingbase.schema.KingbaseSchemaDialect;
import org.apache.datawise.backend.connector.postgresql.PostgresqlForkRegistration;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

public final class KingbaseDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        KingbaseSchemaDialect schema = new KingbaseSchemaDialect();
        KingbaseDdlRenderer ddl = new KingbaseDdlRenderer();
        PostgresqlConnectorOperations postgresql = PostgresqlForkRegistration.connectorOps(schema, ddl);
        return new KingbaseDataSourceConnector(context.jdbc(), postgresql);
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return PostgresqlForkRegistration.contributions(
                DbType.KINGBASE,
                22,
                new KingbaseSchemaDialect(),
                new KingbaseDdlRenderer(),
                new KingbaseLogicalTypeParser()
        );
    }
}
