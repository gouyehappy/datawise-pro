package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.domain.YarnAppDetailDto;
import org.apache.datawise.backend.domain.YarnAppsResultDto;
import org.apache.datawise.backend.domain.YarnClusterInfoDto;
import org.apache.datawise.backend.domain.YarnMutationResultDto;
import org.apache.datawise.backend.domain.YarnNodesResultDto;
import org.apache.datawise.backend.domain.YarnQueuesResultDto;
import org.apache.datawise.backend.domain.YarnKillApplicationRequest;
import org.apache.datawise.backend.domain.YarnMoveApplicationQueueRequest;
import org.apache.datawise.backend.domain.YarnRemoveQueueRequest;
import org.apache.datawise.backend.domain.YarnUpdateQueueRequest;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Service;

@Service
public class ExplorerYarnService {

    private final ConnectionExecutionContext connectionContext;
    private final ConnectorFacade connectorFacade;

    public ExplorerYarnService(
            ConnectionExecutionContext connectionContext,
            ConnectorFacade connectorFacade
    ) {
        this.connectionContext = connectionContext;
        this.connectorFacade = connectorFacade;
    }

    public YarnClusterInfoDto clusterInfo(String connectionId) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.clusterManager().clusterInfo(connection);
    }

    public YarnAppsResultDto listApplications(
            String connectionId,
            String state,
            String user,
            String queue,
            Integer limit
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int pageSize = limit == null || limit <= 0 ? 200 : Math.min(limit, 500);
        return connectorFacade.clusterManager().listApplications(
                connection, state, user, queue, pageSize
        );
    }

    public YarnAppDetailDto describeApplication(String connectionId, String appId) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.clusterManager().describeApplication(connection, appId);
    }

    public YarnNodesResultDto listNodes(String connectionId, Integer limit) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int pageSize = limit == null || limit <= 0 ? 500 : Math.min(limit, 1000);
        return connectorFacade.clusterManager().listNodes(connection, pageSize);
    }

    public YarnQueuesResultDto listQueues(String connectionId) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.clusterManager().listQueues(connection);
    }

    public YarnMutationResultDto killApplication(String connectionId, String appId, YarnKillApplicationRequest request) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        String diagnostics = request != null ? request.diagnostics() : null;
        return connectorFacade.clusterManager().killApplication(connection, appId, diagnostics);
    }

    public YarnMutationResultDto moveApplicationQueue(
            String connectionId,
            String appId,
            YarnMoveApplicationQueueRequest request
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        if (request == null || request.queue() == null || request.queue().isBlank()) {
            throw new IllegalArgumentException("queue is required");
        }
        return connectorFacade.clusterManager().moveApplicationQueue(connection, appId, request.queue());
    }

    public YarnMutationResultDto updateQueue(String connectionId, YarnUpdateQueueRequest request) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        if (request == null || request.queueName() == null || request.queueName().isBlank()) {
            throw new IllegalArgumentException("queueName is required");
        }
        if (request.params() == null || request.params().isEmpty()) {
            throw new IllegalArgumentException("params is required");
        }
        return connectorFacade.clusterManager().updateQueue(connection, request.queueName(), request.params());
    }

    public YarnMutationResultDto removeQueue(String connectionId, YarnRemoveQueueRequest request) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        if (request == null || request.queueName() == null || request.queueName().isBlank()) {
            throw new IllegalArgumentException("queueName is required");
        }
        return connectorFacade.clusterManager().removeQueue(connection, request.queueName());
    }

    private ConnectionEntity requireAvailableExplorerConnection(String connectionId) {
        return connectionContext.requireAvailableConnectionForCurrentUser(
                connectionId,
                ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND
        ).entity();
    }
}
