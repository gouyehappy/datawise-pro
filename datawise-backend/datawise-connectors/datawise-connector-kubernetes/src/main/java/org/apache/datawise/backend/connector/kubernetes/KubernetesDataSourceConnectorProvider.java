package org.apache.datawise.backend.connector.kubernetes;

import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

public final class KubernetesDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new KubernetesDataSourceConnector(new KubernetesConnectorOperations());
    }
}
