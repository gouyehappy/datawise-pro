package org.apache.datawise.backend.connector.nacos;

import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.connector.operation.ConnectorNacosOperations;
import org.apache.datawise.backend.domain.ConnectorExplorerFeatureDto;
import org.apache.datawise.backend.domain.ConnectorExplorerUiProfileDto;

import java.util.EnumSet;
import java.util.List;

public class NacosDataSourceConnector implements DataSourceConnector {

    private static final EnumSet<ConnectorCapability> CAPABILITIES = EnumSet.of(
            ConnectorCapability.CONNECTION_TEST,
            ConnectorCapability.CATALOG,
            ConnectorCapability.NACOS
    );

    private static final ConnectorExplorerUiProfileDto EXPLORER_UI = new ConnectorExplorerUiProfileDto(
            "nacos",
            List.of(
                    new ConnectorExplorerFeatureDto(
                            "configs",
                            "nacos-feature",
                            "nacos-configs",
                            "open-nacos-configs",
                            "settings",
                            "explorer.nacosFeatures.configs",
                            10,
                            false,
                            true,
                            null
                    ),
                    new ConnectorExplorerFeatureDto(
                            "services",
                            "nacos-feature",
                            "nacos-services",
                            "open-nacos-services",
                            "link",
                            "explorer.nacosFeatures.services",
                            20,
                            false,
                            true,
                            null
                    )
            )
    );

    private final NacosConnectorOperations nacos;

    public NacosDataSourceConnector(NacosConnectorOperations nacos) {
        this.nacos = nacos;
    }

    @Override
    public String id() {
        return "nacos";
    }

    @Override
    public int priority() {
        return 10;
    }

    @Override
    public boolean supports(String dbType) {
        return dbType != null && "nacos".equalsIgnoreCase(dbType);
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
        return nacos;
    }

    @Override
    public ConnectorCatalogOperations catalog() {
        return nacos;
    }

    @Override
    public ConnectorNacosOperations nacos() {
        return nacos;
    }
}
