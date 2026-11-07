package org.apache.datawise.backend.connector.sqlserver;

import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.SqlServerDataSourceConnector;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;
import org.apache.datawise.backend.connector.sqlserver.dml.SqlServerFamilyDmlDialect;
import org.apache.datawise.backend.connector.sqlserver.ops.SqlServerFamilyDatabaseOps;
import org.apache.datawise.backend.connector.sqlserver.schema.SqlServerSchemaDialect;
import org.apache.datawise.backend.connector.sqlserver.support.SqlServerTableIntrospector;

import java.util.List;

public final class SqlServerDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new SqlServerDataSourceConnector(context.jdbc());
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        SqlServerFamilyDatabaseOps ops = new SqlServerFamilyDatabaseOps();
        return new ConnectorDialectContributions(
                List.of(),
                List.of(),
                List.of(new SqlServerSchemaDialect()),
                List.of(new SqlServerTableIntrospector()),
                List.of(new SqlServerFamilyDmlDialect()),
                List.of(ops),
                List.of(ops),
                List.of(ops),
                List.of(),
                List.of()
        );
    }
}
