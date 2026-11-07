package org.apache.datawise.backend.connector.sybase;

import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.SybaseDataSourceConnector;
import org.apache.datawise.backend.connector.sybase.dml.SybaseFamilyDmlDialect;
import org.apache.datawise.backend.connector.sybase.schema.SybaseSchemaDialect;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

import java.util.List;

public final class SybaseDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new SybaseDataSourceConnector(context.jdbc());
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return new ConnectorDialectContributions(
                List.of(),
                List.of(),
                List.of(new SybaseSchemaDialect()),
                List.of(),
                List.of(new SybaseFamilyDmlDialect()),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of()
        );
    }
}
