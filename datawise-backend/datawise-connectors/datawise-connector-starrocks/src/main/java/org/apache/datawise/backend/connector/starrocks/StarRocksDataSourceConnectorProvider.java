package org.apache.datawise.backend.connector.starrocks;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.StarRocksDataSourceConnector;
import org.apache.datawise.backend.connector.mysql.MysqlForkRegistration;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;
import org.apache.datawise.backend.connector.starrocks.ddl.StarRocksDdlRenderer;
import org.apache.datawise.backend.connector.starrocks.schema.StarRocksSchemaDialect;
import org.apache.datawise.backend.connector.starrocks.support.StarRocksTableIntrospector;

public final class StarRocksDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new StarRocksDataSourceConnector(context.jdbc());
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return MysqlForkRegistration.olapContributions(
                DbType.STARROCKS,
                20,
                new StarRocksDdlRenderer(),
                new StarRocksSchemaDialect(),
                new StarRocksTableIntrospector()
        );
    }
}
