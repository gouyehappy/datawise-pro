package org.apache.datawise.backend.connector.clickhouse;

import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.clickhouse.dml.ClickHouseFamilyDmlDialect;
import org.apache.datawise.backend.connector.clickhouse.schema.ClickHouseSchemaDialect;
import org.apache.datawise.backend.connector.clickhouse.support.ClickHouseTableIntrospector;
import org.apache.datawise.backend.connector.jdbc.ClickHouseDataSourceConnector;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

import java.util.List;

public final class ClickHouseDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new ClickHouseDataSourceConnector(context.jdbc());
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return new ConnectorDialectContributions(
                List.of(),
                List.of(),
                List.of(new ClickHouseSchemaDialect()),
                List.of(new ClickHouseTableIntrospector()),
                List.of(new ClickHouseFamilyDmlDialect()),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of()
        );
    }
}
