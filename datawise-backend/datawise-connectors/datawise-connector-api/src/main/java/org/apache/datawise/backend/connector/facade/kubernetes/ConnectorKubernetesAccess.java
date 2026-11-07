package org.apache.datawise.backend.connector.facade.kubernetes;

import org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess;
import org.apache.datawise.backend.domain.K8sApplyResultDto;
import org.apache.datawise.backend.domain.K8sClusterInfoDto;
import org.apache.datawise.backend.domain.K8sConfigMapsResultDto;
import org.apache.datawise.backend.domain.K8sCrdsResultDto;
import org.apache.datawise.backend.domain.K8sDeploymentsResultDto;
import org.apache.datawise.backend.domain.K8sEventsResultDto;
import org.apache.datawise.backend.domain.K8sHelmReleasesResultDto;
import org.apache.datawise.backend.domain.K8sLogsDto;
import org.apache.datawise.backend.domain.K8sMutationResultDto;
import org.apache.datawise.backend.domain.K8sNamespacesResultDto;
import org.apache.datawise.backend.domain.K8sPodDetailDto;
import org.apache.datawise.backend.domain.K8sPodsResultDto;
import org.apache.datawise.backend.domain.K8sSecretsResultDto;
import org.apache.datawise.backend.domain.K8sServicesResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Component;

/** Kubernetes API capability entry. */
@Component
public class ConnectorKubernetesAccess {

    private final ConnectorCatalogAccess catalog;

    public ConnectorKubernetesAccess(ConnectorCatalogAccess catalog) {
        this.catalog = catalog;
    }

    public K8sClusterInfoDto clusterInfo(ConnectionEntity connection) {
        return catalog.resolve(connection).kubernetes().clusterInfo(connection);
    }

    public K8sNamespacesResultDto listNamespaces(ConnectionEntity connection, String nameFilter, int limit) {
        return catalog.resolve(connection).kubernetes().listNamespaces(connection, nameFilter, limit);
    }

    public K8sPodsResultDto listPods(
                                     ConnectionEntity connection,
                                     String namespace,
                                     String labelSelector,
                                     String fieldSelector,
                                     int limit) {
        return catalog.resolve(connection).kubernetes().listPods(
                connection, namespace, labelSelector, fieldSelector, limit);
    }

    public K8sPodDetailDto describePod(ConnectionEntity connection, String namespace, String podName) {
        return catalog.resolve(connection).kubernetes().describePod(connection, namespace, podName);
    }

    public K8sDeploymentsResultDto listDeployments(
                                                   ConnectionEntity connection,
                                                   String namespace,
                                                   String labelSelector,
                                                   int limit) {
        return catalog.resolve(connection).kubernetes().listDeployments(
                connection, namespace, labelSelector, limit);
    }

    public K8sServicesResultDto listServices(
                                             ConnectionEntity connection,
                                             String namespace,
                                             String labelSelector,
                                             int limit) {
        return catalog.resolve(connection).kubernetes().listServices(
                connection, namespace, labelSelector, limit);
    }

    public K8sConfigMapsResultDto listConfigMaps(
                                                 ConnectionEntity connection,
                                                 String namespace,
                                                 String labelSelector,
                                                 int limit) {
        return catalog.resolve(connection).kubernetes().listConfigMaps(
                connection, namespace, labelSelector, limit);
    }

    public K8sSecretsResultDto listSecrets(
                                           ConnectionEntity connection,
                                           String namespace,
                                           String labelSelector,
                                           int limit) {
        return catalog.resolve(connection).kubernetes().listSecrets(
                connection, namespace, labelSelector, limit);
    }

    public K8sLogsDto podLogs(
                              ConnectionEntity connection,
                              String namespace,
                              String podName,
                              String container,
                              int tailLines) {
        return catalog.resolve(connection).kubernetes().podLogs(
                connection, namespace, podName, container, tailLines);
    }

    public K8sEventsResultDto listEvents(
                                         ConnectionEntity connection,
                                         String namespace,
                                         String involvedName,
                                         int limit) {
        return catalog.resolve(connection).kubernetes().listEvents(
                connection, namespace, involvedName, limit);
    }

    public K8sCrdsResultDto listCrds(ConnectionEntity connection, String nameFilter, int limit) {
        return catalog.resolve(connection).kubernetes().listCrds(connection, nameFilter, limit);
    }

    public K8sHelmReleasesResultDto listHelmReleases(ConnectionEntity connection, String namespace, int limit) {
        return catalog.resolve(connection).kubernetes().listHelmReleases(connection, namespace, limit);
    }

    public K8sApplyResultDto applyYaml(ConnectionEntity connection, String yaml, String defaultNamespace) {
        return catalog.resolve(connection).kubernetes().applyYaml(connection, yaml, defaultNamespace);
    }

    public K8sMutationResultDto deletePod(ConnectionEntity connection, String namespace, String podName) {
        return catalog.resolve(connection).kubernetes().deletePod(connection, namespace, podName);
    }

    public K8sMutationResultDto restartDeployment(
                                                  ConnectionEntity connection,
                                                  String namespace,
                                                  String deploymentName) {
        return catalog.resolve(connection).kubernetes().restartDeployment(connection, namespace, deploymentName);
    }
}
