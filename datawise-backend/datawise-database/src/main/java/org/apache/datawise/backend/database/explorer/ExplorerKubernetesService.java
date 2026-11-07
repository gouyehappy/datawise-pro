package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
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
import org.apache.datawise.backend.service.TeamService;
import org.springframework.stereotype.Service;

@Service
public class ExplorerKubernetesService {

    private final ConnectionExecutionContext connectionContext;
    private final ConnectorFacade connectorFacade;
    private final TeamService teamService;

    public ExplorerKubernetesService(
            ConnectionExecutionContext connectionContext,
            ConnectorFacade connectorFacade,
            TeamService teamService
    ) {
        this.connectionContext = connectionContext;
        this.connectorFacade = connectorFacade;
        this.teamService = teamService;
    }

    public K8sClusterInfoDto clusterInfo(String connectionId) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.kubernetes().clusterInfo(connection);
    }

    public K8sNamespacesResultDto listNamespaces(String connectionId, String nameFilter, Integer limit) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int pageSize = limit == null || limit <= 0 ? 200 : Math.min(limit, 500);
        return connectorFacade.kubernetes().listNamespaces(connection, nameFilter, pageSize);
    }

    public K8sPodsResultDto listPods(
            String connectionId,
            String namespace,
            String labelSelector,
            String fieldSelector,
            Integer limit
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int pageSize = limit == null || limit <= 0 ? 200 : Math.min(limit, 500);
        return connectorFacade.kubernetes().listPods(
                connection, namespace, labelSelector, fieldSelector, pageSize
        );
    }

    public K8sPodDetailDto describePod(String connectionId, String namespace, String podName) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.kubernetes().describePod(connection, namespace, podName);
    }

    public K8sDeploymentsResultDto listDeployments(
            String connectionId,
            String namespace,
            String labelSelector,
            Integer limit
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int pageSize = limit == null || limit <= 0 ? 200 : Math.min(limit, 500);
        return connectorFacade.kubernetes().listDeployments(connection, namespace, labelSelector, pageSize);
    }

    public K8sServicesResultDto listServices(
            String connectionId,
            String namespace,
            String labelSelector,
            Integer limit
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int pageSize = limit == null || limit <= 0 ? 200 : Math.min(limit, 500);
        return connectorFacade.kubernetes().listServices(connection, namespace, labelSelector, pageSize);
    }

    public K8sConfigMapsResultDto listConfigMaps(
            String connectionId,
            String namespace,
            String labelSelector,
            Integer limit
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int pageSize = limit == null || limit <= 0 ? 200 : Math.min(limit, 500);
        return connectorFacade.kubernetes().listConfigMaps(connection, namespace, labelSelector, pageSize);
    }

    public K8sSecretsResultDto listSecrets(
            String connectionId,
            String namespace,
            String labelSelector,
            Integer limit
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int pageSize = limit == null || limit <= 0 ? 200 : Math.min(limit, 500);
        return connectorFacade.kubernetes().listSecrets(connection, namespace, labelSelector, pageSize);
    }

    public K8sLogsDto podLogs(
            String connectionId,
            String namespace,
            String podName,
            String container,
            Integer tailLines
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int lines = tailLines == null || tailLines <= 0 ? 200 : Math.min(tailLines, 5000);
        return connectorFacade.kubernetes().podLogs(connection, namespace, podName, container, lines);
    }

    public K8sEventsResultDto listEvents(
            String connectionId,
            String namespace,
            String involvedName,
            Integer limit
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int pageSize = limit == null || limit <= 0 ? 100 : Math.min(limit, 500);
        return connectorFacade.kubernetes().listEvents(connection, namespace, involvedName, pageSize);
    }

    public K8sCrdsResultDto listCrds(String connectionId, String nameFilter, Integer limit) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int pageSize = limit == null || limit <= 0 ? 200 : Math.min(limit, 500);
        return connectorFacade.kubernetes().listCrds(connection, nameFilter, pageSize);
    }

    public K8sHelmReleasesResultDto listHelmReleases(String connectionId, String namespace, Integer limit) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int pageSize = limit == null || limit <= 0 ? 100 : Math.min(limit, 500);
        return connectorFacade.kubernetes().listHelmReleases(connection, namespace, pageSize);
    }

    public K8sApplyResultDto applyYaml(String connectionId, String yaml, String defaultNamespace) {
        var resolved = connectionContext.requireAvailableConnectionForCurrentUser(
                connectionId,
                ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND
        );
        K8sApplyResultDto result = connectorFacade.kubernetes().applyYaml(
                resolved.entity(), yaml, defaultNamespace
        );
        Long userId = resolved.userId();
        teamService.recordTerminalAudit(
                userId,
                "k8s.apply",
                "connectionId=" + connectionId
                        + "; success=" + result.success()
                        + "; resources=" + (result.resources() != null ? result.resources().size() : 0)
                        + "; message=" + (result.message() != null ? result.message() : "")
        );
        return result;
    }

    public K8sMutationResultDto deletePod(String connectionId, String namespace, String podName) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.kubernetes().deletePod(connection, namespace, podName);
    }

    public K8sMutationResultDto restartDeployment(String connectionId, String namespace, String deploymentName) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.kubernetes().restartDeployment(connection, namespace, deploymentName);
    }

    private ConnectionEntity requireAvailableExplorerConnection(String connectionId) {
        return connectionContext.requireAvailableConnectionForCurrentUser(
                connectionId,
                ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND
        ).entity();
    }
}
