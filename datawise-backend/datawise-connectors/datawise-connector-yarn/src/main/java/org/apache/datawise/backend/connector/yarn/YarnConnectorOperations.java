package org.apache.datawise.backend.connector.yarn;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorClusterManagerOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.connector.yarn.support.YarnConnectionErrors;
import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.domain.YarnAppDetailDto;
import org.apache.datawise.backend.domain.YarnAppsResultDto;
import org.apache.datawise.backend.domain.YarnClusterInfoDto;
import org.apache.datawise.backend.domain.YarnMutationResultDto;
import org.apache.datawise.backend.domain.YarnNodesResultDto;
import org.apache.datawise.backend.domain.YarnQueuesResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.yarn.YarnConnectionSupport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Map;

public class YarnConnectorOperations
        implements ConnectorConnectionOperations, ConnectorCatalogOperations, ConnectorClusterManagerOperations {

    private static final Logger log = LoggerFactory.getLogger(YarnConnectorOperations.class);

    @Override
    public ConnectionTestResult test(ConnectionEntity entity) {
        long start = System.currentTimeMillis();
        try {
            YarnClusterInfoDto info = YarnConnectionSupport.clusterInfo(entity);
            long latency = System.currentTimeMillis() - start;
            String message = String.format(
                    "Connected to YARN RM %s (%s) in %dms",
                    entity.getHost(),
                    info.state() != null ? info.state() : "unknown",
                    latency
            );
            return new ConnectionTestResult(true, message, latency);
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "YARN connection test failed for " + entity.getHost(), ex);
            long latency = System.currentTimeMillis() - start;
            return new ConnectionTestResult(false, YarnConnectionErrors.toUserMessage(entity, ex), latency);
        }
    }

    @Override
    public List<TreeNode> loadConnectionRoot(ConnectionEntity connection, String pattern) {
        return List.of();
    }

    @Override
    public YarnClusterInfoDto clusterInfo(ConnectionEntity connection) {
        return wrap(() -> YarnConnectionSupport.clusterInfo(connection));
    }

    @Override
    public YarnAppsResultDto listApplications(
            ConnectionEntity connection,
            String state,
            String user,
            String queue,
            int limit
    ) {
        return wrap(() -> YarnConnectionSupport.listApplications(connection, state, user, queue, limit));
    }

    @Override
    public YarnAppDetailDto describeApplication(ConnectionEntity connection, String appId) {
        return wrap(() -> YarnConnectionSupport.describeApplication(connection, appId));
    }

    @Override
    public YarnNodesResultDto listNodes(ConnectionEntity connection, int limit) {
        return wrap(() -> YarnConnectionSupport.listNodes(connection, limit));
    }

    @Override
    public YarnQueuesResultDto listQueues(ConnectionEntity connection) {
        return wrap(() -> YarnConnectionSupport.listQueues(connection));
    }

    @Override
    public YarnMutationResultDto killApplication(ConnectionEntity connection, String appId, String diagnostics) {
        return wrap(() -> YarnConnectionSupport.killApplication(connection, appId, diagnostics));
    }

    @Override
    public YarnMutationResultDto moveApplicationQueue(ConnectionEntity connection, String appId, String queue) {
        return wrap(() -> YarnConnectionSupport.moveApplicationQueue(connection, appId, queue));
    }

    @Override
    public YarnMutationResultDto updateQueue(
            ConnectionEntity connection,
            String queueName,
            Map<String, String> params
    ) {
        return wrap(() -> YarnConnectionSupport.updateQueue(connection, queueName, params));
    }

    @Override
    public YarnMutationResultDto removeQueue(ConnectionEntity connection, String queueName) {
        return wrap(() -> YarnConnectionSupport.removeQueue(connection, queueName));
    }

    private static <T> T wrap(YarnCallable<T> callable) {
        try {
            return callable.call();
        } catch (Exception ex) {
            throw new IllegalStateException(ex.getMessage(), ex);
        }
    }

    @FunctionalInterface
    private interface YarnCallable<T> {
        T call() throws Exception;
    }
}
