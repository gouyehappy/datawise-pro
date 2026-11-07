package org.apache.datawise.backend.connector.dm;

import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.dm.dml.DmFamilyDmlDialect;
import org.apache.datawise.backend.connector.dm.ops.DmFamilyDatabaseOps;
import org.apache.datawise.backend.connector.dm.schema.DmSchemaDialect;
import org.apache.datawise.backend.connector.dm.sql.DmSqlPaginationDialect;
import org.apache.datawise.backend.connector.dm.support.DmTableIntrospector;
import org.apache.datawise.backend.connector.jdbc.DmDataSourceConnector;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

import java.util.List;

public final class DmDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new DmDataSourceConnector(context.jdbc());
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        DmFamilyDatabaseOps ops = new DmFamilyDatabaseOps();
        return new ConnectorDialectContributions(
                List.of(),
                List.of(),
                List.of(new DmSchemaDialect()),
                List.of(new DmTableIntrospector()),
                List.of(new DmFamilyDmlDialect()),
                List.of(ops),
                List.of(ops),
                List.of(ops),
                List.of(new DmSqlPaginationDialect()),
                List.of()
        );
    }
}
