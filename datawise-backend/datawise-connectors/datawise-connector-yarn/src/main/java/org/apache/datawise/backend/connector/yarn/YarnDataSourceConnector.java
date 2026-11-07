package org.apache.datawise.backend.connector.yarn;

import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorClusterManagerOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.domain.ConnectorExplorerFeatureDto;
import org.apache.datawise.backend.domain.ConnectorExplorerUiProfileDto;

import java.util.EnumSet;
import java.util.List;

public class YarnDataSourceConnector implements DataSourceConnector {

    private static final EnumSet<ConnectorCapability> CAPABILITIES = EnumSet.of(
            ConnectorCapability.CONNECTION_TEST,
            ConnectorCapability.CATALOG,
            ConnectorCapability.CLUSTER_MANAGER
    );

    private static final ConnectorExplorerUiProfileDto EXPLORER_UI = new ConnectorExplorerUiProfileDto(
            "yarn",
            List.of(
                    new ConnectorExplorerFeatureDto(
                            "workbench",
                            "yarn-feature",
                            "yarn-applications",
                            "open-yarn-workbench",
                            "tab-yarn",
                            "explorer.yarnFeatures.workbench",
                            5,
                            true,
                            false,
                            null
                    ),
                    new ConnectorExplorerFeatureDto(
                            "applications",
                            "yarn-feature",
                            "yarn-applications",
                            "open-yarn-applications",
                            "tab-yarn",
                            "explorer.yarnFeatures.applications",
                            10,
                            false,
                            true,
                            null
                    ),
                    new ConnectorExplorerFeatureDto(
                            "nodes",
                            "yarn-feature",
                            "yarn-nodes",
                            "open-yarn-nodes",
                            "cpu",
                            "explorer.yarnFeatures.nodes",
                            20,
                            false,
                            true,
                            null
                    ),
                    new ConnectorExplorerFeatureDto(
                            "queues",
                            "yarn-feature",
                            "yarn-queues",
                            "open-yarn-queues",
                            "menu-group",
                            "explorer.yarnFeatures.queues",
                            30,
                            false,
                            true,
                            null
                    )
            )
    );

    private final YarnConnectorOperations yarn;

    public YarnDataSourceConnector(YarnConnectorOperations yarn) {
        this.yarn = yarn;
    }

    @Override
    public String id() {
        return "yarn";
    }

    @Override
    public int priority() {
        return 10;
    }

    @Override
    public boolean supports(String dbType) {
        return dbType != null && "yarn".equalsIgnoreCase(dbType);
    }

    @Override
    public EnumSet<ConnectorCapability> capabilities() {
        return EnumSet.copyOf(CAPABILITIES);
    }

    @Override
    public ConnectorExplorerUiProfileDto explorerUi() {
        return EXPLORER_UI;
    }

    @Override
    public ConnectorConnectionOperations connection() {
        return yarn;
    }

    @Override
    public ConnectorCatalogOperations catalog() {
        return yarn;
    }

    @Override
    public ConnectorClusterManagerOperations clusterManager() {
        return yarn;
    }
}
