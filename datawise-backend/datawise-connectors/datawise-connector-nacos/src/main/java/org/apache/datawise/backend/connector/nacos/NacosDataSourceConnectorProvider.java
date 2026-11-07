package org.apache.datawise.backend.connector.nacos;

import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

public final class NacosDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new NacosDataSourceConnector(new NacosConnectorOperations());
    }
}
