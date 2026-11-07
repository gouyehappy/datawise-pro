package org.apache.datawise.backend.connector.tdengine;

import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.TdengineDataSourceConnector;
import org.apache.datawise.backend.connector.tdengine.dml.TdengineFamilyDmlDialect;
import org.apache.datawise.backend.connector.tdengine.schema.TdengineSchemaDialect;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

import java.util.List;

public final class TdengineDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new TdengineDataSourceConnector(context.jdbc());
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return new ConnectorDialectContributions(
                List.of(),
                List.of(),
                List.of(new TdengineSchemaDialect()),
                List.of(),
                List.of(new TdengineFamilyDmlDialect()),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of()
        );
    }
}
