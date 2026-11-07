package org.apache.datawise.backend.connector.elasticsearch;

import org.apache.datawise.backend.connector.elasticsearch.dml.ElasticsearchFamilyDmlDialect;
import org.apache.datawise.backend.connector.elasticsearch.explorer.ElasticsearchSchemaExplorer;
import org.apache.datawise.backend.connector.elasticsearch.schema.ElasticsearchSchemaDialect;
import org.apache.datawise.backend.connector.elasticsearch.support.ElasticsearchTableIntrospector;
import org.apache.datawise.backend.connector.jdbc.ElasticsearchDataSourceConnector;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;
import org.apache.datawise.backend.connector.DataSourceConnector;

import java.util.List;

public final class ElasticsearchDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new ElasticsearchDataSourceConnector(context.jdbc(), new ElasticsearchConnectorOperations());
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return new ConnectorDialectContributions(
                List.of(),
                List.of(),
                List.of(new ElasticsearchSchemaDialect()),
                List.of(new ElasticsearchTableIntrospector()),
                List.of(new ElasticsearchFamilyDmlDialect()),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(new ElasticsearchSchemaExplorer())
        );
    }
}
