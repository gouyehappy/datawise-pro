package org.apache.datawise.backend.connector.flink;

import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.flink.dml.FlinkFamilyDmlDialect;
import org.apache.datawise.backend.connector.flink.schema.FlinkSchemaDialect;
import org.apache.datawise.backend.connector.flink.sql.FlinkSqlPaginationDialect;
import org.apache.datawise.backend.connector.flink.support.FlinkTableMetadataIntrospection;
import org.apache.datawise.backend.connector.jdbc.FlinkDataSourceConnector;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

import java.util.List;

public final class FlinkDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new FlinkDataSourceConnector(context.jdbc());
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return new ConnectorDialectContributions(
                List.of(),
                List.of(),
                List.of(new FlinkSchemaDialect()),
                List.of(new FlinkTableMetadataIntrospection()),
                List.of(new FlinkFamilyDmlDialect()),
                List.of(),
                List.of(),
                List.of(),
                List.of(new FlinkSqlPaginationDialect()),
                List.of()
        );
    }
}
