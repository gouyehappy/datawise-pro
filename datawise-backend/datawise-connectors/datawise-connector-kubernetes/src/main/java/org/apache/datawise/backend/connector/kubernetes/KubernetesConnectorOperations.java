package org.apache.datawise.backend.connector.kubernetes;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.connector.kubernetes.support.KubernetesConnectionErrors;
import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.connector.operation.ConnectorKubernetesOperations;
import org.apache.datawise.backend.domain.ConnectionTestResult;
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
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.kubernetes.KubernetesConnectionSupport;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

public class KubernetesConnectorOperations
        implements ConnectorConnectionOperations, ConnectorCatalogOperations, ConnectorKubernetesOperations {

    private static final Logger log = LoggerFactory.getLogger(KubernetesConnectorOperations.class);

    @Override
    public ConnectionTestResult test(ConnectionEntity entity) {
        long start = System.currentTimeMillis();
        try {
            K8sClusterInfoDto info = KubernetesConnectionSupport.clusterInfo(entity);
            long latency = System.currentTimeMillis() - start;
            String version = info.gitVersion() != null ? info.gitVersion() : "unknown";
            String message = String.format(
                    "Connected to Kubernetes %s (%s) in %dms",
                    entity.getHost(),
                    version,
                    latency
            );
            return new ConnectionTestResult(true, message, latency);
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "Kubernetes connection test failed for " + entity.getHost(), ex);
            long latency = System.currentTimeMillis() - start;
            return new ConnectionTestResult(false, KubernetesConnectionErrors.toUserMessage(entity, ex), latency);
        }
    }

    @Override
    public List<TreeNode> loadConnectionRoot(ConnectionEntity connection, String pattern) {
        return List.of();
    }

    @Override
    public K8sClusterInfoDto clusterInfo(ConnectionEntity connection) {
        return wrap(connection, () -> KubernetesConnectionSupport.clusterInfo(connection));
    }

    @Override
    public K8sNamespacesResultDto listNamespaces(ConnectionEntity connection, String nameFilter, int limit) {
        return wrap(connection, () -> KubernetesConnectionSupport.listNamespaces(connection, nameFilter, limit));
    }

    @Override
    public K8sPodsResultDto listPods(
            ConnectionEntity connection,
            String namespace,
            String labelSelector,
            String fieldSelector,
            int limit
    ) {
        return wrap(connection, () -> KubernetesConnectionSupport.listPods(
                connection, namespace, labelSelector, fieldSelector, limit
        ));
    }

    @Override
    public K8sPodDetailDto describePod(ConnectionEntity connection, String namespace, String podName) {
        return wrap(connection, () -> KubernetesConnectionSupport.describePod(connection, namespace, podName));
    }

    @Override
    public K8sDeploymentsResultDto listDeployments(
            ConnectionEntity connection,
            String namespace,
            String labelSelector,
            int limit
    ) {
        return wrap(connection, () -> KubernetesConnectionSupport.listDeployments(
                connection, namespace, labelSelector, limit
        ));
    }

    @Override
    public K8sServicesResultDto listServices(
            ConnectionEntity connection,
            String namespace,
            String labelSelector,
            int limit
    ) {
        return wrap(connection, () -> KubernetesConnectionSupport.listServices(
                connection, namespace, labelSelector, limit
        ));
    }

    @Override
    public K8sConfigMapsResultDto listConfigMaps(
            ConnectionEntity connection,
            String namespace,
            String labelSelector,
            int limit
    ) {
        return wrap(connection, () -> KubernetesConnectionSupport.listConfigMaps(
                connection, namespace, labelSelector, limit
        ));
    }

    @Override
    public K8sSecretsResultDto listSecrets(
            ConnectionEntity connection,
            String namespace,
            String labelSelector,
            int limit
    ) {
        return wrap(connection, () -> KubernetesConnectionSupport.listSecrets(
                connection, namespace, labelSelector, limit
        ));
    }

    @Override
    public K8sLogsDto podLogs(
            ConnectionEntity connection,
            String namespace,
            String podName,
            String container,
            int tailLines
    ) {
        return wrap(connection, () -> KubernetesConnectionSupport.podLogs(
                connection, namespace, podName, container, tailLines
        ));
    }

    @Override
    public K8sEventsResultDto listEvents(
            ConnectionEntity connection,
            String namespace,
            String involvedName,
            int limit
    ) {
        return wrap(connection, () -> KubernetesConnectionSupport.listEvents(
                connection, namespace, involvedName, limit
        ));
    }

    @Override
    public K8sCrdsResultDto listCrds(ConnectionEntity connection, String nameFilter, int limit) {
        return wrap(connection, () -> KubernetesConnectionSupport.listCrds(connection, nameFilter, limit));
    }

    @Override
    public K8sHelmReleasesResultDto listHelmReleases(ConnectionEntity connection, String namespace, int limit) {
        return wrap(connection, () -> KubernetesConnectionSupport.listHelmReleases(connection, namespace, limit));
    }

    @Override
    public K8sApplyResultDto applyYaml(ConnectionEntity connection, String yaml, String defaultNamespace) {
        return wrap(connection, () -> KubernetesConnectionSupport.applyYaml(connection, yaml, defaultNamespace));
    }

    @Override
    public K8sMutationResultDto deletePod(ConnectionEntity connection, String namespace, String podName) {
        return wrap(connection, () -> KubernetesConnectionSupport.deletePod(connection, namespace, podName));
    }

    @Override
    public K8sMutationResultDto restartDeployment(
            ConnectionEntity connection,
            String namespace,
            String deploymentName
    ) {
        return wrap(connection, () -> KubernetesConnectionSupport.restartDeployment(
                connection, namespace, deploymentName
        ));
    }

    private static <T> T wrap(ConnectionEntity connection, KubernetesCallable<T> callable) {
        try {
            return callable.call();
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            String message = KubernetesConnectionErrors.toUserMessage(connection, ex);
            if (KubernetesConnectionErrors.isClientFacingError(ex)) {
                throw new IllegalArgumentException(message, ex);
            }
            throw new IllegalStateException(message, ex);
        }
    }

    @FunctionalInterface
    private interface KubernetesCallable<T> {
        T call() throws Exception;
    }
}
