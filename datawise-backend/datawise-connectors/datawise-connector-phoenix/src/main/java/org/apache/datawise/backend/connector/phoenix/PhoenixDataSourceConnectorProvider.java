package org.apache.datawise.backend.connector.phoenix;

import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.PhoenixDataSourceConnector;
import org.apache.datawise.backend.connector.phoenix.dml.PhoenixFamilyDmlDialect;
import org.apache.datawise.backend.connector.phoenix.schema.PhoenixSchemaDialect;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

import java.util.List;

public final class PhoenixDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new PhoenixDataSourceConnector(context.jdbc());
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return new ConnectorDialectContributions(
                List.of(),
                List.of(),
                List.of(new PhoenixSchemaDialect()),
                List.of(),
                List.of(new PhoenixFamilyDmlDialect()),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of()
        );
    }
}
