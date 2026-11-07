package org.apache.datawise.backend.connector.kubernetes;

import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.connector.operation.ConnectorKubernetesOperations;
import org.apache.datawise.backend.domain.ConnectorExplorerFeatureDto;
import org.apache.datawise.backend.domain.ConnectorExplorerUiProfileDto;

import java.util.EnumSet;
import java.util.List;

public class KubernetesDataSourceConnector implements DataSourceConnector {

    private static final EnumSet<ConnectorCapability> CAPABILITIES = EnumSet.of(
            ConnectorCapability.CONNECTION_TEST,
            ConnectorCapability.CATALOG,
            ConnectorCapability.KUBERNETES
    );

    private static final ConnectorExplorerUiProfileDto EXPLORER_UI = new ConnectorExplorerUiProfileDto(
            "kubernetes",
            List.of(
                    k8sFeature("pods", "open-k8s-pods", "cpu", "explorer.k8sFeatures.pods", 10),
                    k8sFeature("deployments", "open-k8s-deployments", "menu-group", "explorer.k8sFeatures.deployments", 20),
                    k8sFeature("services", "open-k8s-services", "cpu", "explorer.k8sFeatures.services", 30),
                    k8sFeature("events", "open-k8s-events", "cpu", "explorer.k8sFeatures.events", 40),
                    k8sFeature("configmaps", "open-k8s-configmaps", "cpu", "explorer.k8sFeatures.configmaps", 50),
                    k8sFeature("secrets", "open-k8s-secrets", "cpu", "explorer.k8sFeatures.secrets", 60),
                    k8sFeature("apply", "open-k8s-apply", "cpu", "explorer.k8sFeatures.apply", 70),
                    k8sFeature("crds", "open-k8s-crds", "cpu", "explorer.k8sFeatures.crds", 80),
                    k8sFeature("helm", "open-k8s-helm", "cpu", "explorer.k8sFeatures.helm", 90)
            )
    );

    private final KubernetesConnectorOperations kubernetes;

    public KubernetesDataSourceConnector(KubernetesConnectorOperations kubernetes) {
        this.kubernetes = kubernetes;
    }

    private static ConnectorExplorerFeatureDto k8sFeature(
            String id,
            String menuId,
            String icon,
            String labelKey,
            int order
    ) {
        // Preserve historical tree ids `{connectionId}:k8s:feature:{id}` (dbType is kubernetes).
        return new ConnectorExplorerFeatureDto(
                id,
                "k8s-feature",
                "k8s-" + id,
                menuId,
                icon,
                labelKey,
                order,
                null,
                null,
                ":k8s:feature:" + id
        );
    }

    @Override
    public String id() {
        return "kubernetes";
    }

    @Override
    public int priority() {
        return 10;
    }

    @Override
    public boolean supports(String dbType) {
        return dbType != null && "kubernetes".equalsIgnoreCase(dbType);
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
        return kubernetes;
    }

    @Override
    public ConnectorCatalogOperations catalog() {
        return kubernetes;
    }

    @Override
    public ConnectorKubernetesOperations kubernetes() {
        return kubernetes;
    }
}
