package org.apache.datawise.backend.connector.hsql;

import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.HsqlDataSourceConnector;
import org.apache.datawise.backend.connector.hsql.dml.HsqlFamilyDmlDialect;
import org.apache.datawise.backend.connector.hsql.schema.HsqlSchemaDialect;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

import java.util.List;

public final class HsqlDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new HsqlDataSourceConnector(context.jdbc());
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return new ConnectorDialectContributions(
                List.of(),
                List.of(),
                List.of(new HsqlSchemaDialect()),
                List.of(),
                List.of(new HsqlFamilyDmlDialect()),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of()
        );
    }
}
