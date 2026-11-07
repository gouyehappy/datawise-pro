package org.apache.datawise.backend.connector.gbase8a;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.gbase8a.ddl.Gbase8aDdlRenderer;
import org.apache.datawise.backend.connector.gbase8a.support.Gbase8aTableIntrospector;
import org.apache.datawise.backend.connector.jdbc.Gbase8aDataSourceConnector;
import org.apache.datawise.backend.connector.mysql.MysqlForkRegistration;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

public final class Gbase8aDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new Gbase8aDataSourceConnector(context.jdbc());
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return MysqlForkRegistration.withOps(
                DbType.GBASE8A,
                21,
                20,
                new Gbase8aDdlRenderer(),
                new Gbase8aTableIntrospector()
        );
    }
}
