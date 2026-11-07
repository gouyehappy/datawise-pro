package org.apache.datawise.backend.connector.oracle;

import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.OracleDataSourceConnector;
import org.apache.datawise.backend.connector.oracle.dml.OracleFamilyDmlDialect;
import org.apache.datawise.backend.connector.oracle.ops.OracleFamilyDatabaseOps;
import org.apache.datawise.backend.connector.oracle.schema.OracleSchemaDialect;
import org.apache.datawise.backend.jdbc.execution.pagination.OracleSqlPaginationDialect;
import org.apache.datawise.backend.connector.oracle.support.OracleTableIntrospector;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

import java.util.List;

public final class OracleDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new OracleDataSourceConnector(context.jdbc());
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        OracleFamilyDatabaseOps ops = new OracleFamilyDatabaseOps();
        return new ConnectorDialectContributions(
                List.of(),
                List.of(),
                List.of(new OracleSchemaDialect()),
                List.of(new OracleTableIntrospector()),
                List.of(new OracleFamilyDmlDialect()),
                List.of(ops),
                List.of(ops),
                List.of(ops),
                List.of(new OracleSqlPaginationDialect()),
                List.of()
        );
    }
}
