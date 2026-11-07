package org.apache.datawise.backend.connector.polaris;

import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.connector.operation.ConnectorPolarisOperations;
import org.apache.datawise.backend.domain.ConnectorExplorerFeatureDto;
import org.apache.datawise.backend.domain.ConnectorExplorerUiProfileDto;

import java.util.EnumSet;
import java.util.List;

public class PolarisDataSourceConnector implements DataSourceConnector {

    private static final EnumSet<ConnectorCapability> CAPABILITIES = EnumSet.of(
            ConnectorCapability.CONNECTION_TEST,
            ConnectorCapability.CATALOG,
            ConnectorCapability.POLARIS
    );

    private static final ConnectorExplorerUiProfileDto EXPLORER_UI = new ConnectorExplorerUiProfileDto(
            "polaris",
            List.of(
                    new ConnectorExplorerFeatureDto(
                            "services",
                            "polaris-feature",
                            "polaris-services",
                            "open-polaris-services",
                            "link",
                            "explorer.polarisFeatures.services",
                            10,
                            false,
                            true,
                            null
                    ),
                    new ConnectorExplorerFeatureDto(
                            "configs",
                            "polaris-feature",
                            "polaris-configs",
                            "open-polaris-configs",
                            "settings",
                            "explorer.polarisFeatures.configs",
                            20,
                            false,
                            true,
                            null
                    )
            )
    );

    private final PolarisConnectorOperations polaris;

    public PolarisDataSourceConnector(PolarisConnectorOperations polaris) {
        this.polaris = polaris;
    }

    @Override
    public String id() {
        return "polaris";
    }

    @Override
    public int priority() {
        return 10;
    }

    @Override
    public boolean supports(String dbType) {
        return dbType != null && "polaris".equalsIgnoreCase(dbType);
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
        return polaris;
    }

    @Override
    public ConnectorCatalogOperations catalog() {
        return polaris;
    }

    @Override
    public ConnectorPolarisOperations polaris() {
        return polaris;
    }
}
