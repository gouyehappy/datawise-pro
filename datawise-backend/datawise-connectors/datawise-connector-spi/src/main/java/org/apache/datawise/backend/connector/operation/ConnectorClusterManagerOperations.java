package org.apache.datawise.backend.connector.operation;

import org.apache.datawise.backend.domain.YarnAppDetailDto;
import org.apache.datawise.backend.domain.YarnAppsResultDto;
import org.apache.datawise.backend.domain.YarnClusterInfoDto;
import org.apache.datawise.backend.domain.YarnMutationResultDto;
import org.apache.datawise.backend.domain.YarnNodesResultDto;
import org.apache.datawise.backend.domain.YarnQueuesResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;

public interface ConnectorClusterManagerOperations {

    YarnClusterInfoDto clusterInfo(ConnectionEntity connection);

    YarnAppsResultDto listApplications(
                                       ConnectionEntity connection,
                                       String state,
                                       String user,
                                       String queue,
                                       int limit);

    YarnAppDetailDto describeApplication(ConnectionEntity connection, String appId);

    YarnNodesResultDto listNodes(ConnectionEntity connection, int limit);

    YarnQueuesResultDto listQueues(ConnectionEntity connection);

    YarnMutationResultDto killApplication(ConnectionEntity connection, String appId, String diagnostics);

    YarnMutationResultDto moveApplicationQueue(ConnectionEntity connection, String appId, String queue);

    YarnMutationResultDto updateQueue(
                                      ConnectionEntity connection,
                                      String queueName,
                                      java.util.Map<String, String> params);

    YarnMutationResultDto removeQueue(ConnectionEntity connection, String queueName);
}
