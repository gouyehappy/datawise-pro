package org.apache.datawise.backend.connector.kudu;

import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

public final class KuduDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new KuduDataSourceConnector(new KuduConnectorOperations());
    }
}
