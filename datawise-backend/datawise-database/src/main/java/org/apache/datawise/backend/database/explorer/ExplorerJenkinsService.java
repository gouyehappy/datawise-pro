package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.domain.JenkinsBuildLogDto;
import org.apache.datawise.backend.domain.JenkinsInfoDto;
import org.apache.datawise.backend.domain.JenkinsJobDetailDto;
import org.apache.datawise.backend.domain.JenkinsJobsResultDto;
import org.apache.datawise.backend.domain.JenkinsMutationResultDto;
import org.apache.datawise.backend.domain.JenkinsNodesResultDto;
import org.apache.datawise.backend.domain.JenkinsQueueResultDto;
import org.apache.datawise.backend.domain.JenkinsTriggerBuildRequest;
import org.apache.datawise.backend.domain.JenkinsViewsResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class ExplorerJenkinsService {

    private final ConnectionExecutionContext connectionContext;
    private final ConnectorFacade connectorFacade;

    public ExplorerJenkinsService(
            ConnectionExecutionContext connectionContext,
            ConnectorFacade connectorFacade
    ) {
        this.connectionContext = connectionContext;
        this.connectorFacade = connectorFacade;
    }

    public JenkinsInfoDto info(String connectionId) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.ciCd().info(connection);
    }

    public JenkinsViewsResultDto listViews(String connectionId) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.ciCd().listViews(connection);
    }

    public JenkinsJobsResultDto listJobs(
            String connectionId,
            String nameFilter,
            Integer limit,
            String view,
            String folder,
            Boolean browse
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int pageSize = limit == null || limit <= 0 ? 500 : Math.min(limit, 2000);
        boolean browseMode = Boolean.TRUE.equals(browse);
        return connectorFacade.ciCd().listJobs(connection, nameFilter, pageSize, view, folder, browseMode);
    }

    public JenkinsJobDetailDto describeJob(String connectionId, String jobName) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        requireJobName(jobName);
        return connectorFacade.ciCd().describeJob(connection, jobName.trim());
    }

    public JenkinsMutationResultDto triggerBuild(
            String connectionId,
            String jobName,
            JenkinsTriggerBuildRequest request
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        requireJobName(jobName);
        Map<String, String> parameters = request != null ? request.parameters() : null;
        return connectorFacade.ciCd().triggerBuild(connection, jobName.trim(), parameters);
    }

    public JenkinsMutationResultDto stopBuild(String connectionId, String jobName, int buildNumber) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        requireJobName(jobName);
        if (buildNumber <= 0) {
            throw new IllegalArgumentException("buildNumber must be positive");
        }
        return connectorFacade.ciCd().stopBuild(connection, jobName.trim(), buildNumber);
    }

    public JenkinsBuildLogDto buildLog(String connectionId, String jobName, int buildNumber, Integer start) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        requireJobName(jobName);
        if (buildNumber <= 0) {
            throw new IllegalArgumentException("buildNumber must be positive");
        }
        int offset = start == null || start < 0 ? 0 : start;
        return connectorFacade.ciCd().buildLog(connection, jobName.trim(), buildNumber, offset);
    }

    public JenkinsQueueResultDto listQueue(String connectionId, String jobName) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.ciCd().listQueue(connection, jobName);
    }

    public JenkinsNodesResultDto listNodes(String connectionId) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.ciCd().listNodes(connection);
    }

    private ConnectionEntity requireAvailableExplorerConnection(String connectionId) {
        return connectionContext.requireAvailableConnectionForCurrentUser(
                connectionId,
                ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND
        ).entity();
    }

    private static void requireJobName(String jobName) {
        if (jobName == null || jobName.isBlank()) {
            throw new IllegalArgumentException("job name is required");
        }
    }
}
