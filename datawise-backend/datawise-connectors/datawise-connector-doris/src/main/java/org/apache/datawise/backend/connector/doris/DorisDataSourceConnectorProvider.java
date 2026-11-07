package org.apache.datawise.backend.connector.doris;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.doris.ddl.DorisDdlRenderer;
import org.apache.datawise.backend.connector.doris.schema.DorisSchemaDialect;
import org.apache.datawise.backend.connector.doris.support.DorisTableIntrospector;
import org.apache.datawise.backend.connector.jdbc.DorisDataSourceConnector;
import org.apache.datawise.backend.connector.mysql.MysqlForkRegistration;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

public final class DorisDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new DorisDataSourceConnector(context.jdbc());
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return MysqlForkRegistration.olapContributions(
                DbType.DORIS,
                20,
                new DorisDdlRenderer(),
                new DorisSchemaDialect(),
                new DorisTableIntrospector()
        );
    }
}
