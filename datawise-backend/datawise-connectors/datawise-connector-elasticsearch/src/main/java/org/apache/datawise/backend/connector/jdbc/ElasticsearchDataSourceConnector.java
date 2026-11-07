package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.elasticsearch.ElasticsearchConnectorOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.connector.operation.ConnectorDocumentOperations;
import org.apache.datawise.backend.connector.operation.ConnectorElasticsearchOperations;
import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;
import org.apache.datawise.backend.domain.ConnectorExplorerFeatureDto;
import org.apache.datawise.backend.domain.ConnectorExplorerUiProfileDto;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/**
 * Hybrid Elasticsearch connector: REST for connection test / native ops, JDBC for SQL + explorer.
 */
public class ElasticsearchDataSourceConnector extends AbstractJdbcDataSourceConnector {

    private static final ConnectorExplorerUiProfileDto EXPLORER_UI = new ConnectorExplorerUiProfileDto(
            "elasticsearch",
            List.of(
                    new ConnectorExplorerFeatureDto(
                            "workbench",
                            "elasticsearch-feature",
                            "elasticsearch-workbench",
                            "open-elasticsearch-workbench",
                            "console",
                            "explorer.elasticsearchFeatures.workbench",
                            10,
                            true,
                            true,
                            null
                    )
            )
    );

    private final ElasticsearchConnectorOperations rest;

    public ElasticsearchDataSourceConnector(ConnectorJdbcOperations jdbc, ElasticsearchConnectorOperations rest) {
        super("jdbc-elasticsearch", 21, Set.of("elasticsearch"), jdbc);
        this.rest = rest;
    }

    /** @deprecated Prefer {@link #ElasticsearchDataSourceConnector(ConnectorJdbcOperations, ElasticsearchConnectorOperations)}. */
    @Deprecated
    public ElasticsearchDataSourceConnector(ConnectorJdbcOperations jdbc) {
        this(jdbc, new ElasticsearchConnectorOperations());
    }

    @Override
    public EnumSet<ConnectorCapability> capabilities() {
        EnumSet<ConnectorCapability> caps = super.capabilities();
        caps.add(ConnectorCapability.NATIVE_COMMAND);
        caps.add(ConnectorCapability.DOCUMENT_READ);
        return caps;
    }

    @Override
    public ConnectorExplorerUiProfileDto explorerUi() {
        return EXPLORER_UI;
    }

    @Override
    public ConnectorConnectionOperations connection() {
        return rest;
    }

    @Override
    public ConnectorElasticsearchOperations elasticsearch() {
        return rest;
    }

    @Override
    public ConnectorDocumentOperations document() {
        return rest;
    }
}
