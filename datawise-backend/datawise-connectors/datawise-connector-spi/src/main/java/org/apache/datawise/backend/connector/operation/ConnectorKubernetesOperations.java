package org.apache.datawise.backend.connector.operation;

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

/** Kubernetes API server operations. */
public interface ConnectorKubernetesOperations {

    K8sClusterInfoDto clusterInfo(ConnectionEntity connection);

    K8sNamespacesResultDto listNamespaces(ConnectionEntity connection, String nameFilter, int limit);

    K8sPodsResultDto listPods(
                              ConnectionEntity connection,
                              String namespace,
                              String labelSelector,
                              String fieldSelector,
                              int limit);

    K8sPodDetailDto describePod(ConnectionEntity connection, String namespace, String podName);

    K8sDeploymentsResultDto listDeployments(
                                            ConnectionEntity connection,
                                            String namespace,
                                            String labelSelector,
                                            int limit);

    K8sServicesResultDto listServices(
                                      ConnectionEntity connection,
                                      String namespace,
                                      String labelSelector,
                                      int limit);

    K8sConfigMapsResultDto listConfigMaps(
                                          ConnectionEntity connection,
                                          String namespace,
                                          String labelSelector,
                                          int limit);

    K8sSecretsResultDto listSecrets(
                                    ConnectionEntity connection,
                                    String namespace,
                                    String labelSelector,
                                    int limit);

    K8sLogsDto podLogs(
                       ConnectionEntity connection,
                       String namespace,
                       String podName,
                       String container,
                       int tailLines);

    K8sEventsResultDto listEvents(
                                  ConnectionEntity connection,
                                  String namespace,
                                  String involvedName,
                                  int limit);

    K8sCrdsResultDto listCrds(ConnectionEntity connection, String nameFilter, int limit);

    K8sHelmReleasesResultDto listHelmReleases(ConnectionEntity connection, String namespace, int limit);

    K8sApplyResultDto applyYaml(ConnectionEntity connection, String yaml, String defaultNamespace);

    K8sMutationResultDto deletePod(ConnectionEntity connection, String namespace, String podName);

    K8sMutationResultDto restartDeployment(ConnectionEntity connection, String namespace, String deploymentName);
}
