package org.apache.datawise.backend.connector.hive;

import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.hive.dml.HiveFamilyDmlDialect;
import org.apache.datawise.backend.connector.hive.schema.HiveSchemaDialect;
import org.apache.datawise.backend.connector.hive.sql.HiveSqlPaginationDialect;
import org.apache.datawise.backend.connector.hive.explorer.HiveSchemaExplorer;
import org.apache.datawise.backend.connector.hive.support.HiveTableMetadataIntrospection;
import org.apache.datawise.backend.schema.spi.JdbcSchemaExplorer;
import org.apache.datawise.backend.connector.jdbc.HiveDataSourceConnector;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

import java.util.List;

public final class HiveDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new HiveDataSourceConnector(context.jdbc());
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return new ConnectorDialectContributions(
                List.of(),
                List.of(),
                List.of(new HiveSchemaDialect()),
                List.of(new HiveTableMetadataIntrospection()),
                List.of(new HiveFamilyDmlDialect()),
                List.of(),
                List.of(),
                List.of(),
                List.of(new HiveSqlPaginationDialect()),
                List.of(new HiveSchemaExplorer())
        );
    }
}
