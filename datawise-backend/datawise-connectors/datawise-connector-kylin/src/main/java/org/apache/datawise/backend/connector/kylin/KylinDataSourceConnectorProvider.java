package org.apache.datawise.backend.connector.kylin;

import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.KylinDataSourceConnector;
import org.apache.datawise.backend.connector.kylin.dml.KylinFamilyDmlDialect;
import org.apache.datawise.backend.connector.kylin.explorer.KylinSchemaExplorer;
import org.apache.datawise.backend.connector.kylin.schema.KylinSchemaDialect;
import org.apache.datawise.backend.connector.kylin.support.KylinTableIntrospector;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

import java.util.List;

public final class KylinDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new KylinDataSourceConnector(context.jdbc());
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return new ConnectorDialectContributions(
                List.of(),
                List.of(),
                List.of(new KylinSchemaDialect()),
                List.of(new KylinTableIntrospector()),
                List.of(new KylinFamilyDmlDialect()),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(new KylinSchemaExplorer())
        );
    }
}
