package org.apache.datawise.backend.connector.facade.clustermanager;

import org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess;
import org.apache.datawise.backend.domain.YarnAppDetailDto;
import org.apache.datawise.backend.domain.YarnAppsResultDto;
import org.apache.datawise.backend.domain.YarnClusterInfoDto;
import org.apache.datawise.backend.domain.YarnMutationResultDto;
import org.apache.datawise.backend.domain.YarnNodesResultDto;
import org.apache.datawise.backend.domain.YarnQueuesResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Component;

/** YARN 等集群资源管理能力入口。 */
@Component
public class ConnectorClusterManagerAccess {

    private final ConnectorCatalogAccess catalog;

    public ConnectorClusterManagerAccess(ConnectorCatalogAccess catalog) {
        this.catalog = catalog;
    }

    public YarnClusterInfoDto clusterInfo(ConnectionEntity connection) {
        return catalog.resolve(connection).clusterManager().clusterInfo(connection);
    }

    public YarnAppsResultDto listApplications(
                                              ConnectionEntity connection,
                                              String state,
                                              String user,
                                              String queue,
                                              int limit) {
        return catalog.resolve(connection).clusterManager().listApplications(
                connection, state, user, queue, limit);
    }

    public YarnAppDetailDto describeApplication(ConnectionEntity connection, String appId) {
        return catalog.resolve(connection).clusterManager().describeApplication(connection, appId);
    }

    public YarnNodesResultDto listNodes(ConnectionEntity connection, int limit) {
        return catalog.resolve(connection).clusterManager().listNodes(connection, limit);
    }

    public YarnQueuesResultDto listQueues(ConnectionEntity connection) {
        return catalog.resolve(connection).clusterManager().listQueues(connection);
    }

    public YarnMutationResultDto killApplication(ConnectionEntity connection, String appId, String diagnostics) {
        return catalog.resolve(connection).clusterManager().killApplication(connection, appId, diagnostics);
    }

    public YarnMutationResultDto moveApplicationQueue(ConnectionEntity connection, String appId, String queue) {
        return catalog.resolve(connection).clusterManager().moveApplicationQueue(connection, appId, queue);
    }

    public YarnMutationResultDto updateQueue(
                                             ConnectionEntity connection,
                                             String queueName,
                                             java.util.Map<String, String> params) {
        return catalog.resolve(connection).clusterManager().updateQueue(connection, queueName, params);
    }

    public YarnMutationResultDto removeQueue(ConnectionEntity connection, String queueName) {
        return catalog.resolve(connection).clusterManager().removeQueue(connection, queueName);
    }
}
