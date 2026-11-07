package org.apache.datawise.backend.yarn;

import org.apache.datawise.backend.domain.YarnAppDetailDto;
import org.apache.datawise.backend.domain.YarnAppDto;
import org.apache.datawise.backend.domain.YarnAppsResultDto;
import org.apache.datawise.backend.domain.YarnClusterInfoDto;
import org.apache.datawise.backend.domain.YarnMutationResultDto;
import org.apache.datawise.backend.domain.YarnNodeDto;
import org.apache.datawise.backend.domain.YarnNodesResultDto;
import org.apache.datawise.backend.domain.YarnQueueDto;
import org.apache.datawise.backend.domain.YarnQueuesResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public final class YarnConnectionSupport {

    private YarnConnectionSupport() {
    }

    public static void ping(ConnectionEntity entity) throws Exception {
        clusterInfo(entity);
    }

    public static YarnClusterInfoDto clusterInfo(ConnectionEntity entity) throws Exception {
        YarnRestClient client = new YarnRestClient(YarnConnectionConfig.from(entity));
        JsonNode root = client.clusterInfo();
        JsonNode info = root.path("clusterInfo");
        return new YarnClusterInfoDto(
                YarnRestClient.text(info, "id"),
                YarnRestClient.text(info, "state"),
                YarnRestClient.text(info, "haState"),
                YarnRestClient.text(info, "resourceManagerVersion"),
                YarnRestClient.text(info, "hadoopVersion")
        );
    }

    public static YarnAppsResultDto listApplications(
            ConnectionEntity entity,
            String state,
            String user,
            String queue,
            int limit
    ) throws Exception {
        YarnRestClient client = new YarnRestClient(YarnConnectionConfig.from(entity));
        JsonNode root = client.listApplications(state, user, queue, limit);
        List<JsonNode> rawApps = YarnRestClient.arrayOrSingle(root.path("apps"), "app");
        List<YarnAppDto> apps = new ArrayList<>();
        for (JsonNode app : rawApps) {
            apps.add(toAppSummary(app));
        }
        return new YarnAppsResultDto(List.copyOf(apps), apps.size());
    }

    public static YarnAppDetailDto describeApplication(ConnectionEntity entity, String appId) throws Exception {
        YarnRestClient client = new YarnRestClient(YarnConnectionConfig.from(entity));
        JsonNode root = client.describeApplication(appId);
        JsonNode app = root.path("app");
        return new YarnAppDetailDto(
                YarnRestClient.text(app, "id"),
                YarnRestClient.text(app, "name"),
                YarnRestClient.text(app, "user"),
                YarnRestClient.text(app, "queue"),
                YarnRestClient.text(app, "state"),
                YarnRestClient.text(app, "finalStatus"),
                YarnRestClient.text(app, "applicationType"),
                YarnRestClient.doubleValue(app, "progress"),
                YarnRestClient.longValue(app, "startedTime"),
                YarnRestClient.longValue(app, "finishedTime"),
                YarnRestClient.longValue(app, "elapsedTime"),
                YarnRestClient.longValue(app, "allocatedMB"),
                YarnRestClient.intValue(app, "allocatedVCores"),
                YarnRestClient.intValue(app, "runningContainers"),
                YarnRestClient.text(app, "trackingUrl"),
                YarnRestClient.text(app, "amHostHttpAddress"),
                YarnRestClient.text(app, "diagnostics")
        );
    }

    public static YarnNodesResultDto listNodes(ConnectionEntity entity, int limit) throws Exception {
        YarnRestClient client = new YarnRestClient(YarnConnectionConfig.from(entity));
        JsonNode root = client.listNodes(limit);
        List<JsonNode> rawNodes = YarnRestClient.arrayOrSingle(root.path("nodes"), "node");
        List<YarnNodeDto> nodes = new ArrayList<>();
        for (JsonNode node : rawNodes) {
            nodes.add(new YarnNodeDto(
                    YarnRestClient.text(node, "id"),
                    YarnRestClient.text(node, "state"),
                    YarnRestClient.text(node, "nodeHealthStatus"),
                    YarnRestClient.longValue(node, "lastHealthUpdate"),
                    YarnRestClient.intValue(node, "numContainers"),
                    YarnRestClient.longValue(node, "usedMemoryMB"),
                    YarnRestClient.longValue(node, "availMemoryMB"),
                    YarnRestClient.intValue(node, "usedVirtualCores"),
                    YarnRestClient.intValue(node, "availableVirtualCores")
            ));
        }
        return new YarnNodesResultDto(List.copyOf(nodes), nodes.size());
    }

    public static YarnQueuesResultDto listQueues(ConnectionEntity entity) throws Exception {
        YarnRestClient client = new YarnRestClient(YarnConnectionConfig.from(entity));
        JsonNode root = client.schedulerInfo();
        JsonNode schedulerInfo = root.path("scheduler").path("schedulerInfo");
        String schedulerType = YarnRestClient.text(schedulerInfo, "type");
        List<JsonNode> queueNodes = new ArrayList<>();
        YarnRestClient.collectQueues(schedulerInfo, queueNodes);
        List<YarnQueueDto> queues = new ArrayList<>();
        for (JsonNode queue : queueNodes) {
            String name = YarnRestClient.text(queue, "queueName");
            if (name == null || name.isBlank()) {
                name = YarnRestClient.text(queue, "name");
            }
            if (name == null || name.isBlank()) {
                continue;
            }
            queues.add(new YarnQueueDto(
                    name,
                    YarnRestClient.text(queue, "state"),
                    YarnRestClient.floatValue(queue, "capacity"),
                    YarnRestClient.floatValue(queue, "usedCapacity"),
                    YarnRestClient.intValue(queue, "numApplications")
            ));
        }
        return new YarnQueuesResultDto(List.copyOf(queues), schedulerType);
    }

    public static YarnMutationResultDto killApplication(
            ConnectionEntity entity,
            String appId,
            String diagnostics
    ) throws Exception {
        YarnRestClient client = new YarnRestClient(YarnConnectionConfig.from(entity));
        JsonNode result = client.killApplication(appId, diagnostics);
        String state = YarnRestClient.text(result, "state");
        return new YarnMutationResultDto(
                true,
                "Kill request accepted for application " + appId,
                state != null ? state : "KILLED"
        );
    }

    public static YarnMutationResultDto moveApplicationQueue(
            ConnectionEntity entity,
            String appId,
            String queue
    ) throws Exception {
        if (queue == null || queue.isBlank()) {
            throw new IllegalArgumentException("queue is required");
        }
        YarnRestClient client = new YarnRestClient(YarnConnectionConfig.from(entity));
        JsonNode result = client.moveApplicationQueue(appId, queue);
        String appliedQueue = YarnRestClient.text(result, "queue");
        return new YarnMutationResultDto(
                true,
                "Application " + appId + " moved to queue " + appliedQueue,
                appliedQueue
        );
    }

    public static YarnMutationResultDto updateQueue(
            ConnectionEntity entity,
            String queueName,
            Map<String, String> params
    ) throws Exception {
        YarnRestClient client = new YarnRestClient(YarnConnectionConfig.from(entity));
        String response = client.updateSchedulerQueue(queueName, params);
        String message = response == null || response.isBlank()
                ? "Queue " + queueName + " updated"
                : response.trim();
        return new YarnMutationResultDto(true, message, null);
    }

    public static YarnMutationResultDto removeQueue(ConnectionEntity entity, String queueName) throws Exception {
        YarnRestClient client = new YarnRestClient(YarnConnectionConfig.from(entity));
        String response = client.removeSchedulerQueue(queueName);
        String message = response == null || response.isBlank()
                ? "Queue " + queueName + " removed"
                : response.trim();
        return new YarnMutationResultDto(true, message, null);
    }

    private static YarnAppDto toAppSummary(JsonNode app) {
        return new YarnAppDto(
                YarnRestClient.text(app, "id"),
                YarnRestClient.text(app, "name"),
                YarnRestClient.text(app, "user"),
                YarnRestClient.text(app, "queue"),
                YarnRestClient.text(app, "state"),
                YarnRestClient.text(app, "finalStatus"),
                YarnRestClient.text(app, "applicationType"),
                YarnRestClient.doubleValue(app, "progress"),
                YarnRestClient.longValue(app, "startedTime"),
                YarnRestClient.longValue(app, "finishedTime"),
                YarnRestClient.longValue(app, "elapsedTime"),
                YarnRestClient.longValue(app, "allocatedMB"),
                YarnRestClient.intValue(app, "allocatedVCores"),
                YarnRestClient.intValue(app, "runningContainers"),
                YarnRestClient.text(app, "trackingUrl")
        );
    }
}
