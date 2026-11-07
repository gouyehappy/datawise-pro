package org.apache.datawise.backend.connector.oceanbase;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.OceanbaseDataSourceConnector;
import org.apache.datawise.backend.connector.mysql.MysqlForkRegistration;
import org.apache.datawise.backend.connector.mysql.support.MysqlTableIntrospector;
import org.apache.datawise.backend.connector.oceanbase.ddl.OceanbaseDdlRenderer;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

public final class OceanbaseDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new OceanbaseDataSourceConnector(context.jdbc());
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return MysqlForkRegistration.withOps(
                DbType.OCEANBASE,
                22,
                new OceanbaseDdlRenderer(),
                new MysqlTableIntrospector()
        );
    }
}
