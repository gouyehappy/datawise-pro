package org.apache.datawise.backend.connector.db2;

import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.db2.dml.Db2FamilyDmlDialect;
import org.apache.datawise.backend.connector.db2.ops.Db2FamilyDatabaseOps;
import org.apache.datawise.backend.connector.db2.schema.Db2SchemaDialect;
import org.apache.datawise.backend.connector.db2.sql.Db2SqlPaginationDialect;
import org.apache.datawise.backend.connector.db2.support.Db2TableIntrospector;
import org.apache.datawise.backend.connector.jdbc.Db2DataSourceConnector;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

import java.util.List;

public final class Db2DataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new Db2DataSourceConnector(context.jdbc());
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        Db2FamilyDatabaseOps ops = new Db2FamilyDatabaseOps();
        return new ConnectorDialectContributions(
                List.of(),
                List.of(),
                List.of(new Db2SchemaDialect()),
                List.of(new Db2TableIntrospector()),
                List.of(new Db2FamilyDmlDialect()),
                List.of(ops),
                List.of(ops),
                List.of(ops),
                List.of(new Db2SqlPaginationDialect()),
                List.of()
        );
    }
}
