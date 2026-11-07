package org.apache.datawise.backend.connector.sqlite;

import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.SqliteDataSourceConnector;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;
import org.apache.datawise.backend.connector.sqlite.dml.SqliteFamilyDmlDialect;
import org.apache.datawise.backend.connector.sqlite.schema.SqliteSchemaDialect;

import java.util.List;

public final class SqliteDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new SqliteDataSourceConnector(context.jdbc());
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return new ConnectorDialectContributions(
                List.of(),
                List.of(),
                List.of(new SqliteSchemaDialect()),
                List.of(),
                List.of(new SqliteFamilyDmlDialect()),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of()
        );
    }
}
