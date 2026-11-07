package org.apache.datawise.community.kafkaops;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.apache.datawise.plugin.sdk.StdioJsonRpcSidecar;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.AlterConfigOp;
import org.apache.kafka.clients.admin.AlterConsumerGroupOffsetsResult;
import org.apache.kafka.clients.admin.Config;
import org.apache.kafka.clients.admin.ConfigEntry;
import org.apache.kafka.clients.admin.CreateTopicsResult;
import org.apache.kafka.clients.admin.DeleteTopicsResult;
import org.apache.kafka.clients.admin.DescribeClusterResult;
import org.apache.kafka.clients.admin.DescribeConfigsResult;
import org.apache.kafka.clients.admin.DescribeConsumerGroupsResult;
import org.apache.kafka.clients.admin.DescribeTopicsResult;
import org.apache.kafka.clients.admin.ListConsumerGroupOffsetsResult;
import org.apache.kafka.clients.admin.ListConsumerGroupsResult;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.ListTopicsOptions;
import org.apache.kafka.clients.admin.ListTopicsResult;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.admin.TopicDescription;
import org.apache.kafka.clients.admin.ConsumerGroupDescription;
import org.apache.kafka.clients.admin.MemberDescription;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.clients.producer.RecordMetadata;
import org.apache.kafka.common.Node;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.TopicPartitionInfo;
import org.apache.kafka.common.config.ConfigResource;
import org.apache.kafka.common.serialization.ByteArrayDeserializer;
import org.apache.kafka.common.serialization.ByteArraySerializer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * Kafka Ops sidecar: bootstrap cluster or multi-cluster fleet inventory.
 */
public final class KafkaOpsPluginMain extends StdioJsonRpcSidecar {

    private static final Set<String> TOPIC_CONFIG_ALLOW = Set.of(
            "retention.ms",
            "retention.bytes",
            "max.message.bytes",
            "compression.type",
            "cleanup.policy",
            "min.insync.replicas",
            "unclean.leader.election.enable",
            "message.timestamp.type",
            "segment.ms",
            "segment.bytes"
    );

    private static final int ADMIN_TIMEOUT_SEC = 20;
    private static final int FETCH_MAX = 100;
    private static final int VALUE_PREVIEW = 8192;
    private static final long TOPIC_DESC_CACHE_MS = 15_000L;
    private static final long TOPIC_NAMES_CACHE_MS = 30_000L;
    private static final long GROUP_LIST_CACHE_MS = 10_000L;
    /** Skip liveliness describeCluster if AdminClient recently succeeded. */
    private static final long ENSURE_TTL_MS = 45_000L;

    private final Map<String, Workspace> workspaces = new ConcurrentHashMap<>();
    private final ObjectMapper yaml = new ObjectMapper(new YAMLFactory());
    private volatile Path pluginDataDir;

    public static void main(String[] args) throws Exception {
        new KafkaOpsPluginMain().runStdio();
    }

    @Override
    protected JsonNode handle(String method, JsonNode params) throws Exception {
        return switch (method) {
            case "plugin/initialize" -> initialize(params);
            case "connection/test" -> test(params.path("connection"));
            case "connection/connect" -> connect(params.path("connection"));
            case "connection/disconnect" -> disconnect(params.path("connection").path("id").asText("anon"));
            case "connection/action" -> action(params);
            case "context-menu/invoke" -> ok("message", "Open Kafka Ops from the plugin connection.");

            case "kafka/clusters" -> clusters(requireWs(params), params.path("query").asText(""));
            case "kafka/select" -> select(requireWs(params), params.path("clusterId").asText(""));
            case "kafka/ping-all" -> pingAll(requireWs(params));
            case "kafka/pulse" -> pulse(requireCluster(params));
            case "kafka/brokers" -> brokers(requireCluster(params),
                    params.path("forceLeaders").asBoolean(false));
            case "kafka/topics" -> topics(requireCluster(params), params.path("query").asText(""),
                    params.path("includeInternal").asBoolean(false),
                    params.path("light").asBoolean(false));
            case "kafka/topic" -> topicDetail(requireCluster(params), params.path("topic").asText(""),
                    params.path("includeGroups").asBoolean(false),
                    params.path("offsets").asBoolean(true));
            case "kafka/topic-meta" -> topicMeta(requireCluster(params), params.path("topic").asText(""));
            case "kafka/topic-groups" -> topicGroups(requireCluster(params), params.path("topic").asText(""),
                    params.path("deep").asBoolean(false),
                    params.path("withLag").asBoolean(true));
            case "kafka/topic-create" -> topicCreate(requireCluster(params), params);
            case "kafka/topic-delete" -> topicDelete(requireCluster(params),
                    params.path("topic").asText(""),
                    params.path("allowDangerous").asBoolean(false));
            case "kafka/topic-configs" -> topicConfigs(requireCluster(params), params.path("topic").asText(""));
            case "kafka/topic-config-set" -> topicConfigSet(requireCluster(params),
                    params.path("topic").asText(""),
                    params.path("key").asText(""),
                    params.path("value").asText(""),
                    params.path("allowDangerous").asBoolean(false));
            case "kafka/messages" -> messages(requireCluster(params), params);
            case "kafka/produce" -> produce(requireCluster(params), params);
            case "kafka/groups" -> groups(requireCluster(params), params.path("query").asText(""),
                    params.path("light").asBoolean(false));
            case "kafka/group" -> groupDetail(requireCluster(params), params.path("groupId").asText(""));
            case "kafka/group-lag" -> groupLag(requireCluster(params), params.path("groupId").asText(""));
            case "kafka/reset-offsets" -> resetOffsets(requireCluster(params), params);
            case "kafka/group-delete" -> groupDelete(requireCluster(params),
                    params.path("groupId").asText(""),
                    params.path("allowDangerous").asBoolean(false));
            case "kafka/diagnose" -> diagnose(requireCluster(params));
            case "kafka/demo-fleet-path" -> ok("path", demoFleet().toString());
            default -> throw new UnknownMethodException(method);
        };
    }

    private ObjectNode initialize(JsonNode params) {
        String dir = params.path("pluginDataDir").asText("");
        if (!dir.isBlank()) pluginDataDir = Path.of(dir);
        return ok("ok", true, "name", "Kafka Ops", "demoFleetPath", demoFleet().toString());
    }

    private ObjectNode action(JsonNode params) {
        String id = params.path("action").path("id").asText(params.path("actionId").asText(""));
        if ("use-demo-fleet".equals(id)) {
            ObjectNode out = ok("success", true, "message",
                    "Filled demo fleet inventory. Set Workspace=Fleet, save, then open.");
            ObjectNode fields = out.putObject("fieldValues");
            fields.put("workspaceKind", "fleet");
            fields.put("inventoryPath", demoFleet().toString());
            return out;
        }
        return ok("success", true);
    }

    private Workspace requireWs(JsonNode params) {
        String id = params.path("connectionId").asText("");
        if (id.isBlank()) id = params.path("connection").path("id").asText("anon");
        Workspace ws = workspaces.get(id);
        if (ws == null) {
            JsonNode conn = params.path("connection");
            if (!conn.isMissingNode() && !conn.isNull()) {
                ws = openWorkspace(conn);
                workspaces.put(ws.id, ws);
            }
        }
        if (ws == null) throw new IllegalArgumentException("Workspace not open: " + id);
        return ws;
    }

    private Cluster requireCluster(JsonNode params) {
        Workspace ws = requireWs(params);
        String clusterId = params.path("clusterId").asText("");
        if (!clusterId.isBlank()) ws.activeId = clusterId;
        Cluster c = ws.clusters.get(ws.activeId);
        if (c == null && !ws.clusters.isEmpty()) {
            c = ws.clusters.values().iterator().next();
            ws.activeId = c.id;
        }
        if (c == null) throw new IllegalArgumentException("No Kafka cluster selected");
        c.ensure();
        return c;
    }

    private ObjectNode test(JsonNode connection) {
        try {
            Workspace ws = openWorkspace(connection);
            try {
                if (ws.clusters.isEmpty()) {
                    return ok("success", false, "message", "No clusters configured");
                }
                Cluster first = ws.clusters.values().iterator().next();
                first.ensure();
                DescribeClusterResult d = first.admin.describeCluster();
                String clusterId = d.clusterId().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
                int brokers = d.nodes().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS).size();
                return ok("success", true, "message",
                        "OK · " + ws.kind + " · " + ws.clusters.size() + " cluster(s) · brokers="
                                + brokers + " · id=" + (clusterId == null ? "?" : clusterId)
                                + " · " + first.endpointLabel());
            } finally {
                ws.close();
            }
        } catch (Exception e) {
            return ok("success", false, "message", msg(e));
        }
    }

    private ObjectNode connect(JsonNode connection) {
        Workspace ws = openWorkspace(connection);
        workspaces.put(ws.id, ws);
        return ok("success", true, "handle", "kafka-ops-" + ws.id, "kind", ws.kind, "count", ws.clusters.size());
    }

    private ObjectNode disconnect(String id) {
        Workspace ws = workspaces.remove(id);
        if (ws != null) ws.close();
        return ok("success", true);
    }

    private ObjectNode clusters(Workspace ws, String query) {
        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        ObjectNode out = mapper().createObjectNode();
        out.put("kind", ws.kind);
        out.put("activeId", ws.activeId == null ? "" : ws.activeId);
        out.put("fleet", "fleet".equals(ws.kind) || ws.clusters.size() > 1);
        ArrayNode rows = out.putArray("clusters");
        for (Cluster c : ws.clusters.values()) {
            String hay = (c.id + " " + c.name + " " + c.bootstrapServers + " " + c.tags).toLowerCase(Locale.ROOT);
            if (!q.isEmpty() && !hay.contains(q)) continue;
            ObjectNode row = rows.addObject();
            row.put("id", c.id);
            row.put("name", c.name);
            row.put("shortLabel", c.shortLabel());
            row.put("bootstrapServers", c.bootstrapServers);
            row.put("securityProtocol", c.securityProtocol);
            row.put("tags", c.tags);
            row.put("active", c.id.equals(ws.activeId));
            row.put("connected", c.admin != null);
        }
        out.put("count", rows.size());
        out.put("total", ws.clusters.size());
        return out;
    }

    private ObjectNode select(Workspace ws, String clusterId) {
        if (!ws.clusters.containsKey(clusterId)) {
            throw new IllegalArgumentException("Unknown cluster: " + clusterId);
        }
        ws.activeId = clusterId;
        Cluster c = ws.clusters.get(clusterId);
        c.ensure();
        return ok("success", true, "clusterId", clusterId, "endpoint", c.bootstrapServers);
    }

    private ObjectNode pingAll(Workspace ws) {
        ObjectNode out = mapper().createObjectNode();
        ArrayNode rows = out.putArray("results");
        int okCount = 0;
        for (Cluster c : ws.clusters.values()) {
            ObjectNode row = rows.addObject();
            row.put("id", c.id);
            row.put("name", c.name);
            row.put("endpoint", c.bootstrapServers);
            long t0 = System.nanoTime();
            try {
                c.ensure();
                int n = c.admin.describeCluster().nodes().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS).size();
                row.put("brokers", n);
                row.put("status", "up");
                okCount++;
            } catch (Exception e) {
                row.put("status", "down");
                row.put("error", msg(e));
                c.closeQuietly();
            }
            row.put("ms", (System.nanoTime() - t0) / 1_000_000);
        }
        out.put("up", okCount);
        out.put("down", ws.clusters.size() - okCount);
        return out;
    }

    private ObjectNode pulse(Cluster c) throws Exception {
        DescribeClusterResult dc = c.admin.describeCluster();
        Collection<Node> nodes = dc.nodes().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
        Node controller = dc.controller().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
        String clusterId = dc.clusterId().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);

        Map<String, TopicDescription> descs = c.cachedTopicDescriptions(false);
        int partitions = 0;
        int underReplicated = 0;
        int offline = 0;
        List<ObjectNode> problems = new ArrayList<>();
        for (Map.Entry<String, TopicDescription> e : descs.entrySet()) {
            TopicDescription td = e.getValue();
            int topicUrp = 0;
            int topicOff = 0;
            for (TopicPartitionInfo p : td.partitions()) {
                partitions++;
                if (p.leader() == null || p.leader().id() < 0) {
                    offline++;
                    topicOff++;
                }
                int rf = p.replicas().size();
                if (rf > 0 && p.isr().size() < rf) {
                    underReplicated++;
                    topicUrp++;
                }
            }
            if (topicUrp > 0 || topicOff > 0) {
                ObjectNode prob = mapper().createObjectNode();
                prob.put("name", e.getKey());
                prob.put("underReplicated", topicUrp);
                prob.put("offline", topicOff);
                problems.add(prob);
            }
        }
        problems.sort((a, b) -> Integer.compare(
                b.path("underReplicated").asInt() + b.path("offline").asInt(),
                a.path("underReplicated").asInt() + a.path("offline").asInt()));

        int groupCount = 0;
        try {
            groupCount = c.cachedGroupIds().size();
        } catch (Exception ignored) { }

        ObjectNode out = mapper().createObjectNode();
        out.put("clusterId", c.id);
        out.put("name", c.name);
        out.put("bootstrapServers", c.bootstrapServers);
        out.put("securityProtocol", c.securityProtocol);
        out.put("kafkaClusterId", clusterId == null ? "" : clusterId);
        out.put("brokerCount", nodes.size());
        out.put("controllerId", controller == null ? -1 : controller.id());
        out.put("topicCount", descs.size());
        out.put("partitionCount", partitions);
        out.put("underReplicated", underReplicated);
        out.put("offlinePartitions", offline);
        out.put("groupCount", groupCount);
        out.put("healthy", underReplicated == 0 && offline == 0 && !nodes.isEmpty());
        out.put("cached", c.topicDescFresh());
        ArrayNode bad = out.putArray("problemTopics");
        for (int i = 0; i < Math.min(12, problems.size()); i++) bad.add(problems.get(i));
        out.put("ok", true);
        return out;
    }

    private ObjectNode brokers(Cluster c, boolean forceLeaders) throws Exception {
        DescribeClusterResult dc = c.admin.describeCluster();
        Collection<Node> nodes = dc.nodes().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
        Node controller = dc.controller().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
        int controllerId = controller == null ? -1 : controller.id();

        // Cold path: skip full describeTopics unless cache warm or caller forces leaders
        boolean leadersPending = false;
        Map<String, TopicDescription> descs;
        if (forceLeaders || c.topicDescFresh()) {
            descs = c.cachedTopicDescriptions(false);
        } else {
            descs = Map.of();
            leadersPending = true;
        }
        Map<Integer, Integer> leaderCounts = new HashMap<>();
        for (TopicDescription td : descs.values()) {
            for (TopicPartitionInfo p : td.partitions()) {
                if (p.leader() != null && p.leader().id() >= 0) {
                    leaderCounts.merge(p.leader().id(), 1, Integer::sum);
                }
            }
        }

        ObjectNode out = mapper().createObjectNode();
        ArrayNode rows = out.putArray("brokers");
        List<Node> sorted = nodes.stream().sorted(Comparator.comparingInt(Node::id)).collect(Collectors.toList());
        for (Node n : sorted) {
            ObjectNode row = rows.addObject();
            row.put("id", n.id());
            row.put("host", n.host());
            row.put("port", n.port());
            row.put("rack", n.rack() == null ? "" : n.rack());
            row.put("controller", n.id() == controllerId);
            if (leadersPending) {
                row.put("leaderPartitions", -1);
            } else {
                row.put("leaderPartitions", leaderCounts.getOrDefault(n.id(), 0));
            }
        }
        out.put("controllerId", controllerId);
        out.put("count", rows.size());
        out.put("leadersPending", leadersPending);
        out.put("ok", true);
        return out;
    }

    private ObjectNode topics(Cluster c, String query, boolean includeInternal, boolean light) throws Exception {
        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        Set<String> names = c.cachedTopicNames(true);
        Map<String, TopicDescription> descs = Map.of();
        if (!light && !names.isEmpty()) {
            descs = c.cachedTopicDescriptions(false);
        }

        ObjectNode out = mapper().createObjectNode();
        ArrayNode rows = out.putArray("topics");
        List<String> sorted = new ArrayList<>(names);
        Collections.sort(sorted);
        for (String name : sorted) {
            boolean internal = isInternalTopic(name);
            if (!includeInternal && internal) continue;
            if (!q.isEmpty() && !name.toLowerCase(Locale.ROOT).contains(q)) continue;
            TopicDescription td = descs.get(name);
            ObjectNode row = rows.addObject();
            row.put("name", name);
            row.put("internal", internal);
            if (td == null) {
                row.put("partitions", -1);
                row.put("replicationFactor", -1);
                row.put("underReplicated", 0);
                row.put("offline", 0);
                row.put("light", true);
                continue;
            }
            int urp = 0;
            int offline = 0;
            int rf = 0;
            for (TopicPartitionInfo p : td.partitions()) {
                if (rf == 0) rf = p.replicas().size();
                if (p.leader() == null || p.leader().id() < 0) offline++;
                if (p.replicas().size() > 0 && p.isr().size() < p.replicas().size()) urp++;
            }
            row.put("partitions", td.partitions().size());
            row.put("replicationFactor", rf);
            row.put("underReplicated", urp);
            row.put("offline", offline);
            row.put("light", false);
        }
        out.put("light", light);
        out.put("count", rows.size());
        out.put("ok", true);
        return out;
    }

    /** Partition list only — for Explore dropdown; no offsets / configs / groups. */
    private ObjectNode topicMeta(Cluster c, String topic) throws Exception {
        if (topic == null || topic.isBlank()) throw new IllegalArgumentException("topic required");
        TopicDescription td = c.admin.describeTopics(List.of(topic))
                .allTopicNames().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS).get(topic);
        if (td == null) throw new IllegalArgumentException("Topic not found: " + topic);
        ObjectNode out = mapper().createObjectNode();
        out.put("name", topic);
        out.put("internal", isInternalTopic(topic));
        out.put("partitions", td.partitions().size());
        int rf = td.partitions().isEmpty() ? 0 : td.partitions().get(0).replicas().size();
        out.put("replicationFactor", rf);
        ArrayNode parts = out.putArray("partitionsList");
        for (TopicPartitionInfo p : td.partitions()) {
            ObjectNode row = parts.addObject();
            row.put("partition", p.partition());
            row.put("leader", p.leader() == null ? -1 : p.leader().id());
        }
        out.put("ok", true);
        return out;
    }

    private ObjectNode topicDetail(Cluster c, String topic, boolean includeGroups, boolean offsets) throws Exception {
        if (topic == null || topic.isBlank()) throw new IllegalArgumentException("topic required");
        TopicDescription td = c.admin.describeTopics(List.of(topic))
                .allTopicNames().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS).get(topic);
        if (td == null) throw new IllegalArgumentException("Topic not found: " + topic);

        Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> early = Map.of();
        Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> late = Map.of();
        if (offsets) {
            List<TopicPartition> tps = new ArrayList<>();
            for (TopicPartitionInfo p : td.partitions()) {
                tps.add(new TopicPartition(topic, p.partition()));
            }
            Map<TopicPartition, OffsetSpec> earliest = new HashMap<>();
            Map<TopicPartition, OffsetSpec> latest = new HashMap<>();
            for (TopicPartition tp : tps) {
                earliest.put(tp, OffsetSpec.earliest());
                latest.put(tp, OffsetSpec.latest());
            }
            early = c.admin.listOffsets(earliest).all().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
            late = c.admin.listOffsets(latest).all().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
        }

        ObjectNode out = mapper().createObjectNode();
        out.put("name", topic);
        out.put("internal", isInternalTopic(topic));
        out.put("partitions", td.partitions().size());
        int rf = td.partitions().isEmpty() ? 0 : td.partitions().get(0).replicas().size();
        out.put("replicationFactor", rf);
        out.put("offsetsPending", !offsets);
        ArrayNode parts = out.putArray("partitionDetails");
        long totalMessages = 0;
        long minEarliest = Long.MAX_VALUE;
        boolean truncated = false;
        for (TopicPartitionInfo p : td.partitions()) {
            TopicPartition tp = new TopicPartition(topic, p.partition());
            ObjectNode row = parts.addObject();
            row.put("partition", p.partition());
            row.put("leader", p.leader() == null ? -1 : p.leader().id());
            ArrayNode replicas = row.putArray("replicaBrokers");
            p.replicas().forEach(n -> replicas.add(n.id()));
            ArrayNode isr = row.putArray("isrBrokers");
            p.isr().forEach(n -> isr.add(n.id()));
            row.put("replicas", formatBrokerIds(p.replicas()));
            row.put("isr", formatBrokerIds(p.isr()));
            if (offsets) {
                long start = early.get(tp) == null ? 0 : early.get(tp).offset();
                long end = late.get(tp) == null ? 0 : late.get(tp).offset();
                long msgs = Math.max(0, end - start);
                totalMessages += msgs;
                if (start > 0) truncated = true;
                minEarliest = Math.min(minEarliest, start);
                row.put("earliest", start);
                row.put("latest", end);
                row.put("messages", msgs);
            } else {
                row.put("earliest", -1);
                row.put("latest", -1);
                row.put("messages", -1);
            }
        }
        if (offsets) {
            out.put("estimatedMessages", totalMessages);
            out.put("logTruncated", truncated);
            out.put("minEarliest", minEarliest == Long.MAX_VALUE ? 0 : minEarliest);
        } else {
            out.put("estimatedMessages", -1);
            out.put("logTruncated", false);
            out.put("minEarliest", 0);
        }

        try {
            ConfigResource res = new ConfigResource(ConfigResource.Type.TOPIC, topic);
            Config cfg = c.admin.describeConfigs(List.of(res)).all()
                    .get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS).get(res);
            ArrayNode highlights = out.putArray("configHighlights");
            if (cfg != null) {
                for (String key : TOPIC_CONFIG_ALLOW) {
                    ConfigEntry e = cfg.get(key);
                    if (e == null) continue;
                    ObjectNode h = highlights.addObject();
                    h.put("name", e.name());
                    h.put("value", e.value() == null ? "" : e.value());
                    h.put("default", e.isDefault());
                    h.put("allowSet", true);
                }
            }
        } catch (Exception ignored) {
            out.putArray("configHighlights");
        }

        if (includeGroups) {
            // Fast membership only — lag filled by kafka/topic-groups separately
            out.set("consumerGroups", collectTopicGroups(c, topic, 24, false, false));
        } else {
            out.putArray("consumerGroups");
            out.put("groupsDeferred", true);
        }
        out.put("ok", true);
        return out;
    }

    /**
     * Assignment-based discovery. {@code withLag=false} skips offset RPCs (lag=-1).
     * When lag is needed, topic latest offsets are fetched once and reused across groups.
     * Optional {@code deep} scans idle groups for committed offsets on this topic.
     */
    private ArrayNode collectTopicGroups(Cluster c, String topic, int limit, boolean deep, boolean withLag) {
        ArrayNode rows = mapper().createArrayNode();
        Set<String> found = new LinkedHashSet<>();
        try {
            List<String> ids = c.cachedGroupIds();
            if (ids.isEmpty()) return rows;

            Map<String, ConsumerGroupDescription> descs = c.admin.describeConsumerGroups(ids)
                    .all().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);

            List<ObjectNode> assigned = new ArrayList<>();
            for (String gid : ids) {
                if (assigned.size() >= limit) break;
                ConsumerGroupDescription d = descs.get(gid);
                if (d == null) continue;
                int assignedParts = 0;
                for (MemberDescription m : d.members()) {
                    if (m.assignment() == null) continue;
                    for (TopicPartition tp : m.assignment().topicPartitions()) {
                        if (topic.equals(tp.topic())) assignedParts++;
                    }
                }
                if (assignedParts == 0) continue;
                found.add(gid);
                ObjectNode row = mapper().createObjectNode();
                row.put("groupId", gid);
                row.put("partitions", assignedParts);
                row.put("lag", -1);
                assigned.add(row);
            }

            boolean needLag = withLag || deep;
            Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> topicLatest = Map.of();
            if (needLag && (!assigned.isEmpty() || deep)) {
                try {
                    topicLatest = loadTopicLatestOffsets(c, topic);
                } catch (Exception ignored) {
                    topicLatest = Map.of();
                }
            }

            if (needLag && !topicLatest.isEmpty()) {
                for (ObjectNode row : assigned) {
                    try {
                        fillGroupLag(c, row, topic, topicLatest);
                    } catch (Exception ignored) { /* keep lag=-1 */ }
                }
            }
            for (ObjectNode row : assigned) rows.add(row);
            if (!deep) return rows;

            int scanned = 0;
            for (String gid : ids) {
                if (rows.size() >= limit || scanned >= 20) break;
                if (found.contains(gid)) continue;
                scanned++;
                try {
                    ObjectNode summary = groupLagSummary(c, gid, topic, topicLatest);
                    if (summary.path("partitions").asInt(0) > 0) {
                        found.add(gid);
                        rows.add(summary);
                    }
                } catch (Exception ignored) { }
            }
        } catch (Exception ignored) { }
        return rows;
    }

    private Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> loadTopicLatestOffsets(
            Cluster c, String topic) throws Exception {
        TopicDescription td = c.admin.describeTopics(List.of(topic))
                .allTopicNames().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS).get(topic);
        if (td == null || td.partitions().isEmpty()) return Map.of();
        Map<TopicPartition, OffsetSpec> latest = new HashMap<>();
        for (TopicPartitionInfo p : td.partitions()) {
            latest.put(new TopicPartition(topic, p.partition()), OffsetSpec.latest());
        }
        return c.admin.listOffsets(latest).all().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
    }

    private void fillGroupLag(Cluster c, ObjectNode row, String topic,
                              Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> topicLatest) throws Exception {
        String gid = row.path("groupId").asText("");
        Map<TopicPartition, OffsetAndMetadata> committed = c.admin
                .listConsumerGroupOffsets(gid)
                .partitionsToOffsetAndMetadata()
                .get(6, TimeUnit.SECONDS);
        if (committed == null || committed.isEmpty()) {
            row.put("partitions", 0);
            row.put("lag", 0);
            return;
        }
        int parts = 0;
        long lagSum = 0;
        for (Map.Entry<TopicPartition, OffsetAndMetadata> e : committed.entrySet()) {
            if (!topic.equals(e.getKey().topic())) continue;
            parts++;
            long cur = e.getValue() == null ? -1 : e.getValue().offset();
            long end = topicLatest.get(e.getKey()) == null ? 0 : topicLatest.get(e.getKey()).offset();
            if (cur >= 0) lagSum += Math.max(0, end - cur);
        }
        if (parts > 0) {
            row.put("partitions", parts);
            row.put("lag", lagSum);
        }
    }

    private ObjectNode groupLagSummary(Cluster c, String gid, String topic,
                                       Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> topicLatest) throws Exception {
        ObjectNode row = mapper().createObjectNode();
        row.put("groupId", gid);
        row.put("partitions", 0);
        row.put("lag", -1);
        Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> latest = topicLatest;
        if (latest == null || latest.isEmpty()) {
            latest = loadTopicLatestOffsets(c, topic);
        }
        fillGroupLag(c, row, topic, latest);
        return row;
    }

    private ObjectNode topicGroups(Cluster c, String topic, boolean deep, boolean withLag) {
        if (topic == null || topic.isBlank()) throw new IllegalArgumentException("topic required");
        ObjectNode out = mapper().createObjectNode();
        out.put("topic", topic);
        out.put("deep", deep);
        out.put("withLag", deep || withLag);
        // Deep always needs lag computation to discover idle committed groups
        out.set("groups", collectTopicGroups(c, topic, 40, deep, deep || withLag));
        out.put("ok", true);
        return out;
    }

    private static boolean isInternalTopic(String name) {
        return name != null && name.startsWith("__");
    }

    private static String formatBrokerIds(List<Node> nodes) {
        return nodes.stream().map(n -> "b" + n.id()).collect(Collectors.joining(","));
    }

    private ObjectNode topicCreate(Cluster c, JsonNode params) throws Exception {
        String name = params.path("topic").asText("").trim();
        if (name.isBlank()) throw new IllegalArgumentException("topic required");
        int partitions = params.path("partitions").asInt(1);
        short rf = (short) params.path("replicationFactor").asInt(1);
        if (partitions < 1 || partitions > 1024) throw new IllegalArgumentException("partitions out of range");
        if (rf < 1 || rf > 16) throw new IllegalArgumentException("replicationFactor out of range");
        NewTopic nt = new NewTopic(name, partitions, rf);
        CreateTopicsResult r = c.admin.createTopics(List.of(nt));
        r.all().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
        c.invalidateTopicCache();
        return ok("success", true, "topic", name, "partitions", partitions, "replicationFactor", (int) rf);
    }

    private ObjectNode topicDelete(Cluster c, String topic, boolean allowDangerous) throws Exception {
        if (!allowDangerous) throw new IllegalArgumentException("Deleting a topic requires allowDangerous=true");
        if (topic == null || topic.isBlank()) throw new IllegalArgumentException("topic required");
        DeleteTopicsResult r = c.admin.deleteTopics(List.of(topic));
        r.all().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
        c.invalidateTopicCache();
        return ok("success", true, "topic", topic);
    }

    private ObjectNode topicConfigs(Cluster c, String topic) throws Exception {
        if (topic == null || topic.isBlank()) throw new IllegalArgumentException("topic required");
        ConfigResource res = new ConfigResource(ConfigResource.Type.TOPIC, topic);
        DescribeConfigsResult r = c.admin.describeConfigs(List.of(res));
        Config cfg = r.all().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS).get(res);
        ObjectNode out = mapper().createObjectNode();
        out.put("topic", topic);
        ArrayNode rows = out.putArray("entries");
        if (cfg != null) {
            List<ConfigEntry> entries = new ArrayList<>(cfg.entries());
            entries.sort(Comparator.comparing(ConfigEntry::name));
            for (ConfigEntry e : entries) {
                if (e.isDefault() && e.source() == ConfigEntry.ConfigSource.DEFAULT_CONFIG) {
                    // still include; UI can filter
                }
                ObjectNode row = rows.addObject();
                row.put("name", e.name());
                row.put("value", e.value() == null ? "" : e.value());
                row.put("source", e.source().name());
                row.put("default", e.isDefault());
                row.put("readOnly", e.isReadOnly());
                row.put("sensitive", e.isSensitive());
                row.put("allowSet", TOPIC_CONFIG_ALLOW.contains(e.name()));
            }
        }
        out.put("count", rows.size());
        out.put("ok", true);
        return out;
    }

    private ObjectNode topicConfigSet(Cluster c, String topic, String key, String value, boolean allowDangerous)
            throws Exception {
        if (topic == null || topic.isBlank()) throw new IllegalArgumentException("topic required");
        if (key == null || key.isBlank()) throw new IllegalArgumentException("key required");
        if (!TOPIC_CONFIG_ALLOW.contains(key) && !allowDangerous) {
            throw new IllegalArgumentException("Config '" + key + "' is not on the allowlist; enable dangerous mode");
        }
        ConfigResource res = new ConfigResource(ConfigResource.Type.TOPIC, topic);
        AlterConfigOp op = new AlterConfigOp(new ConfigEntry(key, value), AlterConfigOp.OpType.SET);
        c.admin.incrementalAlterConfigs(Map.of(res, List.of(op)))
                .all().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
        return ok("success", true, "topic", topic, "key", key, "value", value);
    }

    private ObjectNode messages(Cluster c, JsonNode params) {
        String topic = params.path("topic").asText("").trim();
        if (topic.isBlank()) throw new IllegalArgumentException("topic required");
        int partition = params.path("partition").asInt(0);
        String seek = params.path("seek").asText("latest").toLowerCase(Locale.ROOT);
        long offset = params.path("offset").asLong(-1);
        long timestamp = params.path("timestamp").asLong(-1);
        int limit = Math.min(FETCH_MAX, Math.max(1, params.path("limit").asInt(50)));

        Properties props = c.clientProps();
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "datawise-kafka-ops-browse-" + UUID.randomUUID());
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "false");
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, String.valueOf(limit));
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, ByteArrayDeserializer.class.getName());
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, ByteArrayDeserializer.class.getName());

        TopicPartition tp = new TopicPartition(topic, partition);
        ObjectNode out = mapper().createObjectNode();
        ArrayNode rows = out.putArray("records");
        try (KafkaConsumer<byte[], byte[]> consumer = new KafkaConsumer<>(props)) {
            consumer.assign(List.of(tp));
            Map<TopicPartition, Long> beginning = consumer.beginningOffsets(List.of(tp));
            Map<TopicPartition, Long> ending = consumer.endOffsets(List.of(tp));
            long start = beginning.getOrDefault(tp, 0L);
            long end = ending.getOrDefault(tp, 0L);
            out.put("earliest", start);
            out.put("latest", end);

            long target;
            switch (seek) {
                case "earliest" -> target = start;
                case "offset" -> target = Math.max(start, Math.min(offset, end));
                case "timestamp" -> {
                    Map<TopicPartition, Long> tsMap = Map.of(tp, timestamp);
                    var offsetsForTimes = consumer.offsetsForTimes(tsMap);
                    var oat = offsetsForTimes.get(tp);
                    target = oat == null ? end : oat.offset();
                }
                default -> { // latest: show last `limit` messages
                    target = Math.max(start, end - limit);
                }
            }
            consumer.seek(tp, target);

            int got = 0;
            long deadline = System.currentTimeMillis() + 8000;
            while (got < limit && System.currentTimeMillis() < deadline) {
                ConsumerRecords<byte[], byte[]> batch = consumer.poll(Duration.ofMillis(400));
                if (batch.isEmpty()) {
                    if (consumer.position(tp) >= end) break;
                    continue;
                }
                for (ConsumerRecord<byte[], byte[]> rec : batch) {
                    ObjectNode row = rows.addObject();
                    row.put("partition", rec.partition());
                    row.put("offset", rec.offset());
                    row.put("timestamp", rec.timestamp());
                    row.put("timestampType", rec.timestampType() == null ? "" : rec.timestampType().name);
                    row.put("key", decodePreview(rec.key()));
                    row.put("value", decodePreview(rec.value()));
                    row.put("keyBytes", rec.key() == null ? 0 : rec.key().length);
                    row.put("valueBytes", rec.value() == null ? 0 : rec.value().length);
                    ArrayNode headers = row.putArray("headers");
                    rec.headers().forEach(h -> {
                        ObjectNode hh = headers.addObject();
                        hh.put("key", h.key());
                        hh.put("value", decodePreview(h.value()));
                    });
                    got++;
                    if (got >= limit) break;
                }
            }
        }
        out.put("topic", topic);
        out.put("partition", partition);
        out.put("seek", seek);
        out.put("count", rows.size());
        out.put("ok", true);
        return out;
    }

    private ObjectNode produce(Cluster c, JsonNode params) throws Exception {
        boolean allow = params.path("allowDangerous").asBoolean(false);
        if (!allow) throw new IllegalArgumentException("Produce requires allowDangerous=true");
        String topic = params.path("topic").asText("").trim();
        if (topic.isBlank()) throw new IllegalArgumentException("topic required");
        String key = params.path("key").asText(null);
        String value = params.path("value").asText("");
        Integer partition = params.has("partition") && !params.path("partition").isNull()
                ? params.path("partition").asInt()
                : null;

        Properties props = c.clientProps();
        props.put(ProducerConfig.ACKS_CONFIG, "all");
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        try (KafkaProducer<String, String> producer = new KafkaProducer<>(props)) {
            ProducerRecord<String, String> rec = partition == null
                    ? new ProducerRecord<>(topic, key, value)
                    : new ProducerRecord<>(topic, partition, key, value);
            RecordMetadata meta = producer.send(rec).get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
            return ok("success", true,
                    "topic", meta.topic(),
                    "partition", meta.partition(),
                    "offset", meta.offset());
        }
    }

    private ObjectNode groups(Cluster c, String query, boolean light) throws Exception {
        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        List<String> ids = c.cachedGroupIds();
        Map<String, ConsumerGroupDescription> descs = Map.of();
        if (!light && !ids.isEmpty()) {
            // Describe only matching ids when filtered — much cheaper on large fleets
            List<String> target = ids;
            if (!q.isEmpty()) {
                target = ids.stream()
                        .filter(gid -> gid.toLowerCase(Locale.ROOT).contains(q))
                        .limit(200)
                        .collect(Collectors.toList());
            } else if (ids.size() > 300) {
                target = ids.subList(0, 300);
            }
            if (!target.isEmpty()) {
                descs = c.admin.describeConsumerGroups(target).all()
                        .get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
            }
        }

        ObjectNode out = mapper().createObjectNode();
        ArrayNode rows = out.putArray("groups");
        int shown = 0;
        for (String gid : ids) {
            if (!q.isEmpty() && !gid.toLowerCase(Locale.ROOT).contains(q)) continue;
            if (light && shown >= 500) break;
            ConsumerGroupDescription d = descs.get(gid);
            ObjectNode row = rows.addObject();
            row.put("groupId", gid);
            if (d != null) {
                row.put("state", d.state() == null ? "" : d.state().toString());
                row.put("members", d.members().size());
                row.put("simple", d.isSimpleConsumerGroup());
                String coordinator = d.coordinator() == null ? ""
                        : d.coordinator().host() + ":" + d.coordinator().port();
                row.put("coordinator", coordinator);
            } else {
                row.put("state", light ? "?" : "");
                row.put("members", -1);
                row.put("simple", false);
                row.put("coordinator", "");
            }
            shown++;
        }
        out.put("light", light);
        out.put("total", ids.size());
        out.put("count", rows.size());
        out.put("ok", true);
        return out;
    }

    private ObjectNode groupDetail(Cluster c, String groupId) throws Exception {
        if (groupId == null || groupId.isBlank()) throw new IllegalArgumentException("groupId required");
        ConsumerGroupDescription d = c.admin.describeConsumerGroups(List.of(groupId))
                .all().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS).get(groupId);
        ObjectNode out = mapper().createObjectNode();
        out.put("groupId", groupId);
        if (d == null) {
            out.put("ok", false);
            out.put("error", "not found");
            return out;
        }
        out.put("state", d.state() == null ? "" : d.state().toString());
        out.put("simple", d.isSimpleConsumerGroup());
        out.put("partitionAssignor", d.partitionAssignor() == null ? "" : d.partitionAssignor());
        out.put("coordinator", d.coordinator() == null ? ""
                : d.coordinator().id() + "@" + d.coordinator().host() + ":" + d.coordinator().port());
        ArrayNode members = out.putArray("members");
        for (MemberDescription m : d.members()) {
            ObjectNode row = members.addObject();
            row.put("memberId", m.consumerId());
            row.put("clientId", m.clientId());
            row.put("host", m.host());
            ArrayNode assignment = row.putArray("assignment");
            if (m.assignment() != null) {
                for (TopicPartition tp : m.assignment().topicPartitions()) {
                    ObjectNode a = assignment.addObject();
                    a.put("topic", tp.topic());
                    a.put("partition", tp.partition());
                }
            }
        }
        out.put("ok", true);
        return out;
    }

    private ObjectNode groupLag(Cluster c, String groupId) throws Exception {
        if (groupId == null || groupId.isBlank()) throw new IllegalArgumentException("groupId required");
        ListConsumerGroupOffsetsResult offRes = c.admin.listConsumerGroupOffsets(groupId);
        Map<TopicPartition, OffsetAndMetadata> committed =
                offRes.partitionsToOffsetAndMetadata().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);

        ObjectNode out = mapper().createObjectNode();
        out.put("groupId", groupId);
        ArrayNode rows = out.putArray("partitions");
        long totalLag = 0;
        if (committed == null || committed.isEmpty()) {
            out.put("totalLag", 0);
            out.put("count", 0);
            out.put("ok", true);
            return out;
        }

        Map<TopicPartition, OffsetSpec> latestSpec = new HashMap<>();
        for (TopicPartition tp : committed.keySet()) {
            latestSpec.put(tp, OffsetSpec.latest());
        }
        Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> latest =
                c.admin.listOffsets(latestSpec).all().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);

        List<TopicPartition> sorted = new ArrayList<>(committed.keySet());
        sorted.sort(Comparator.comparing(TopicPartition::topic).thenComparingInt(TopicPartition::partition));
        for (TopicPartition tp : sorted) {
            OffsetAndMetadata om = committed.get(tp);
            long consumerOffset = om == null ? -1 : om.offset();
            long end = latest.get(tp) == null ? 0 : latest.get(tp).offset();
            long lag = consumerOffset < 0 ? 0 : Math.max(0, end - consumerOffset);
            totalLag += lag;
            ObjectNode row = rows.addObject();
            row.put("topic", tp.topic());
            row.put("partition", tp.partition());
            row.put("currentOffset", consumerOffset);
            row.put("logEndOffset", end);
            row.put("lag", lag);
        }
        out.put("totalLag", totalLag);
        out.put("count", rows.size());
        out.put("ok", true);
        return out;
    }

    private ObjectNode resetOffsets(Cluster c, JsonNode params) throws Exception {
        boolean allow = params.path("allowDangerous").asBoolean(false);
        if (!allow) throw new IllegalArgumentException("Reset offsets requires allowDangerous=true");
        String groupId = params.path("groupId").asText("").trim();
        String topic = params.path("topic").asText("").trim();
        if (groupId.isBlank()) throw new IllegalArgumentException("groupId required");
        if (topic.isBlank()) throw new IllegalArgumentException("topic required");
        String mode = params.path("mode").asText("earliest").toLowerCase(Locale.ROOT);
        long offset = params.path("offset").asLong(0);
        long timestamp = params.path("timestamp").asLong(-1);

        TopicDescription td = c.admin.describeTopics(List.of(topic))
                .allTopicNames().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS).get(topic);
        if (td == null) throw new IllegalArgumentException("Topic not found: " + topic);

        List<TopicPartition> tps = td.partitions().stream()
                .map(p -> new TopicPartition(topic, p.partition()))
                .collect(Collectors.toList());

        Map<TopicPartition, OffsetAndMetadata> target = new HashMap<>();
        switch (mode) {
            case "latest" -> {
                Map<TopicPartition, OffsetSpec> spec = new HashMap<>();
                for (TopicPartition tp : tps) spec.put(tp, OffsetSpec.latest());
                var late = c.admin.listOffsets(spec).all().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
                for (TopicPartition tp : tps) {
                    long o = late.get(tp) == null ? 0 : late.get(tp).offset();
                    target.put(tp, new OffsetAndMetadata(o));
                }
            }
            case "offset" -> {
                for (TopicPartition tp : tps) target.put(tp, new OffsetAndMetadata(offset));
            }
            case "timestamp" -> {
                Properties props = c.clientProps();
                props.put(ConsumerConfig.GROUP_ID_CONFIG, "datawise-kafka-ops-reset-" + UUID.randomUUID());
                props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
                props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
                try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props)) {
                    Map<TopicPartition, Long> ts = new HashMap<>();
                    for (TopicPartition tp : tps) ts.put(tp, timestamp);
                    var found = consumer.offsetsForTimes(ts);
                    Map<TopicPartition, OffsetSpec> earliestSpec = new HashMap<>();
                    for (TopicPartition tp : tps) earliestSpec.put(tp, OffsetSpec.earliest());
                    var early = c.admin.listOffsets(earliestSpec).all().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
                    for (TopicPartition tp : tps) {
                        var oat = found.get(tp);
                        long o = oat != null ? oat.offset()
                                : (early.get(tp) == null ? 0 : early.get(tp).offset());
                        target.put(tp, new OffsetAndMetadata(o));
                    }
                }
            }
            default -> { // earliest
                Map<TopicPartition, OffsetSpec> spec = new HashMap<>();
                for (TopicPartition tp : tps) spec.put(tp, OffsetSpec.earliest());
                var early = c.admin.listOffsets(spec).all().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
                for (TopicPartition tp : tps) {
                    long o = early.get(tp) == null ? 0 : early.get(tp).offset();
                    target.put(tp, new OffsetAndMetadata(o));
                }
            }
        }

        AlterConsumerGroupOffsetsResult r = c.admin.alterConsumerGroupOffsets(groupId, target);
        r.all().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
        return ok("success", true, "groupId", groupId, "topic", topic, "mode", mode, "partitions", target.size());
    }

    private ObjectNode groupDelete(Cluster c, String groupId, boolean allowDangerous) throws Exception {
        if (!allowDangerous) throw new IllegalArgumentException("Deleting a group requires allowDangerous=true");
        if (groupId == null || groupId.isBlank()) throw new IllegalArgumentException("groupId required");
        c.admin.deleteConsumerGroups(List.of(groupId)).all().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
        c.invalidateGroupCache();
        return ok("success", true, "groupId", groupId);
    }

    private ObjectNode diagnose(Cluster c) throws Exception {
        ObjectNode pulse = pulse(c);
        ObjectNode groups = groups(c, "", true);
        StringBuilder md = new StringBuilder();
        md.append("# Kafka diagnose · ").append(c.name).append("\n\n");
        md.append("- Bootstrap: `").append(c.bootstrapServers).append("`\n");
        md.append("- Cluster id: `").append(pulse.path("kafkaClusterId").asText("")).append("`\n");
        md.append("- Brokers: ").append(pulse.path("brokerCount").asInt()).append("\n");
        md.append("- Controller: ").append(pulse.path("controllerId").asInt()).append("\n");
        md.append("- Topics / partitions: ")
                .append(pulse.path("topicCount").asInt()).append(" / ")
                .append(pulse.path("partitionCount").asInt()).append("\n");
        md.append("- Under-replicated: ").append(pulse.path("underReplicated").asInt()).append("\n");
        md.append("- Offline partitions: ").append(pulse.path("offlinePartitions").asInt()).append("\n");
        md.append("- Consumer groups: ").append(pulse.path("groupCount").asInt()).append("\n");
        md.append("- Healthy: ").append(pulse.path("healthy").asBoolean()).append("\n\n");
        md.append("## Groups (sample)\n");
        ArrayNode gs = (ArrayNode) groups.get("groups");
        int n = 0;
        if (gs != null) {
            for (JsonNode g : gs) {
                if (n++ >= 20) break;
                md.append("- `").append(g.path("groupId").asText())
                        .append("` · ").append(g.path("state").asText(""))
                        .append(" · members=").append(g.path("members").asInt()).append("\n");
            }
        }
        ObjectNode out = mapper().createObjectNode();
        out.put("markdown", md.toString());
        out.put("ok", true);
        return out;
    }

    private Workspace openWorkspace(JsonNode connection) {
        String id = connection.path("id").asText("anon");
        String kind = first(cfg(connection, "workspaceKind"), "bootstrap").toLowerCase(Locale.ROOT);
        Workspace ws = new Workspace(id, kind);
        if ("fleet".equals(kind)) {
            String inv = cfg(connection, "inventoryPath");
            if (inv.isBlank()) throw new IllegalArgumentException("inventoryPath is required for fleet workspace");
            loadInventory(ws, Path.of(inv));
        } else {
            String bootstrap = first(cfg(connection, "bootstrapServers"),
                    connection.path("host").asText(""),
                    "127.0.0.1:9092");
            if (!bootstrap.contains(":") && connection.has("port")) {
                bootstrap = bootstrap + ":" + connection.path("port").asText("9092");
            }
            String security = first(cfg(connection, "securityProtocol"), "PLAINTEXT");
            String sasl = first(cfg(connection, "saslMechanism"), "PLAIN");
            String username = first(externalText(connection, "username"), cfg(connection, "username"));
            String password = first(connection.path("password").asText(""), cfg(connection, "password"));
            String clientId = first(cfg(connection, "clientId"), "datawise-kafka-ops");
            String shortName = shortBootstrapName(bootstrap);
            Cluster cluster = new Cluster(
                    "default",
                    shortName,
                    bootstrap,
                    security,
                    sasl,
                    username,
                    password,
                    clientId,
                    ""
            );
            ws.clusters.put(cluster.id, cluster);
            ws.activeId = cluster.id;
        }
        if (ws.activeId == null && !ws.clusters.isEmpty()) {
            ws.activeId = ws.clusters.keySet().iterator().next();
        }
        return ws;
    }

    private void loadInventory(Workspace ws, Path path) {
        try {
            JsonNode root = yaml.readTree(Files.readString(path));
            JsonNode arr = root.path("clusters");
            if (!arr.isArray()) arr = root.path("instances");
            if (!arr.isArray()) throw new IllegalArgumentException("YAML must contain clusters: []");
            for (JsonNode n : arr) {
                String iid = first(n.path("id").asText(""), n.path("name").asText(""),
                        n.path("bootstrapServers").asText(""));
                if (iid.isBlank()) continue;
                Cluster cluster = new Cluster(
                        iid,
                        first(n.path("name").asText(""), iid),
                        first(n.path("bootstrapServers").asText(""), "127.0.0.1:9092"),
                        first(n.path("securityProtocol").asText(""), "PLAINTEXT"),
                        first(n.path("saslMechanism").asText(""), "PLAIN"),
                        n.path("username").asText(""),
                        n.path("password").asText(""),
                        first(n.path("clientId").asText(""), "datawise-kafka-ops"),
                        tagsOf(n.path("tags"))
                );
                ws.clusters.put(cluster.id, cluster);
            }
            if (ws.clusters.isEmpty()) throw new IllegalArgumentException("No clusters in inventory: " + path);
            ws.activeId = ws.clusters.keySet().iterator().next();
        } catch (IOException e) {
            throw new IllegalArgumentException("Cannot read inventory: " + path + " · " + msg(e));
        }
    }

    private Path demoFleet() {
        Path dest;
        if (pluginDataDir != null) {
            dest = pluginDataDir.resolve("demo-fleet").resolve("kafka-fleet.yml");
        } else {
            dest = Path.of(System.getProperty("java.io.tmpdir"), "datawise-kafka-ops-demo", "kafka-fleet.yml");
        }
        try {
            if (!Files.exists(dest)) {
                Files.createDirectories(dest.getParent());
                try (InputStream in = getClass().getResourceAsStream("/demo-fleet/kafka-fleet.yml")) {
                    if (in == null) throw new IllegalStateException("demo fleet resource missing");
                    Files.copy(in, dest);
                }
            }
        } catch (IOException e) {
            throw new IllegalStateException("Cannot materialize demo fleet: " + msg(e));
        }
        return dest;
    }

    private String cfg(JsonNode connection, String key) {
        String ext = externalText(connection, key);
        if (!ext.isEmpty()) return ext;
        JsonNode cfg = connection.path("config");
        if (cfg.isObject() && cfg.has(key) && !cfg.get(key).isNull()) {
            return cfg.get(key).asText("");
        }
        return "";
    }

    private String externalText(JsonNode connection, String key) {
        JsonNode ext = connection.path("external_config");
        if (ext.isObject() && ext.has(key) && !ext.get(key).isNull()) {
            return ext.get(key).asText("");
        }
        return "";
    }

    private ObjectNode ok(Object... kv) {
        ObjectNode n = mapper().createObjectNode();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            Object v = kv[i + 1];
            String k = String.valueOf(kv[i]);
            if (v instanceof Boolean b) n.put(k, b);
            else if (v instanceof Integer iv) n.put(k, iv);
            else if (v instanceof Long lv) n.put(k, lv);
            else if (v instanceof Double dv) n.put(k, dv);
            else n.put(k, String.valueOf(v));
        }
        return n;
    }

    private static String tagsOf(JsonNode tags) {
        if (!tags.isArray()) return tags.isTextual() ? tags.asText("") : "";
        List<String> parts = new ArrayList<>();
        tags.forEach(t -> parts.add(t.asText("")));
        return String.join(",", parts);
    }

    private static String first(String... values) {
        for (String v : values) if (v != null && !v.isBlank()) return v;
        return "";
    }

    /** First host[:port] from a bootstrap list, for compact UI labels. */
    private static String shortBootstrapName(String bootstrap) {
        if (bootstrap == null || bootstrap.isBlank()) return "Kafka";
        String first = bootstrap.split("[,;\\s]+")[0].trim();
        return first.isEmpty() ? "Kafka" : first;
    }

    private static String decodePreview(byte[] bytes) {
        if (bytes == null) return "";
        String s = new String(bytes, StandardCharsets.UTF_8);
        if (s.length() <= VALUE_PREVIEW) return s;
        return s.substring(0, VALUE_PREVIEW) + "…";
    }

    private static String msg(Exception e) {
        Throwable t = e;
        if (e instanceof ExecutionException && e.getCause() != null) t = e.getCause();
        return t.getMessage() == null ? t.toString() : t.getMessage();
    }

    private static final class Workspace {
        final String id;
        final String kind;
        final Map<String, Cluster> clusters = new LinkedHashMap<>();
        volatile String activeId;

        Workspace(String id, String kind) {
            this.id = id;
            this.kind = kind;
        }

        void close() {
            for (Cluster c : clusters.values()) c.closeQuietly();
        }
    }

    private static final class Cluster {
        final String id;
        final String name;
        final String bootstrapServers;
        final String securityProtocol;
        final String saslMechanism;
        final String username;
        final String password;
        final String clientId;
        final String tags;
        volatile AdminClient admin;
        volatile long topicDescAt;
        volatile Map<String, TopicDescription> topicDescsCache = Map.of();
        volatile long topicNamesAt;
        volatile Set<String> topicNamesCache = Set.of();
        volatile long groupIdsAt;
        volatile List<String> groupIdsCache = List.of();
        volatile long lastEnsureOkAt;

        Cluster(String id, String name, String bootstrapServers, String securityProtocol,
                String saslMechanism, String username, String password, String clientId, String tags) {
            this.id = id;
            this.name = name;
            this.bootstrapServers = bootstrapServers;
            this.securityProtocol = securityProtocol == null ? "PLAINTEXT" : securityProtocol;
            this.saslMechanism = saslMechanism == null ? "PLAIN" : saslMechanism;
            this.username = username == null ? "" : username;
            this.password = password == null ? "" : password;
            this.clientId = clientId == null || clientId.isBlank() ? "datawise-kafka-ops" : clientId;
            this.tags = tags == null ? "" : tags;
        }

        boolean topicDescFresh() {
            return !topicDescsCache.isEmpty()
                    && (System.currentTimeMillis() - topicDescAt) < TOPIC_DESC_CACHE_MS;
        }

        Set<String> listTopicNames(boolean includeInternal) throws Exception {
            ListTopicsOptions opts = new ListTopicsOptions().listInternal(includeInternal);
            return admin.listTopics(opts).names().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
        }

        synchronized Set<String> cachedTopicNames(boolean includeInternal) throws Exception {
            long now = System.currentTimeMillis();
            if (includeInternal
                    && !topicNamesCache.isEmpty()
                    && (now - topicNamesAt) < TOPIC_NAMES_CACHE_MS) {
                return topicNamesCache;
            }
            Set<String> names = listTopicNames(includeInternal);
            if (includeInternal) {
                topicNamesCache = names;
                topicNamesAt = now;
            }
            return names;
        }

        synchronized List<String> cachedGroupIds() throws Exception {
            long now = System.currentTimeMillis();
            if (!groupIdsCache.isEmpty() && (now - groupIdsAt) < GROUP_LIST_CACHE_MS) {
                return groupIdsCache;
            }
            var listings = admin.listConsumerGroups().all().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
            List<String> ids = listings.stream().map(g -> g.groupId()).sorted().collect(Collectors.toList());
            groupIdsCache = ids;
            groupIdsAt = now;
            return ids;
        }

        synchronized Map<String, TopicDescription> cachedTopicDescriptions(boolean force) throws Exception {
            long now = System.currentTimeMillis();
            if (!force && topicDescFresh()) return topicDescsCache;
            Set<String> names = cachedTopicNames(true);
            Map<String, TopicDescription> descs = names.isEmpty()
                    ? Map.of()
                    : admin.describeTopics(names).allTopicNames().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
            topicDescsCache = descs;
            topicDescAt = now;
            topicNamesCache = names;
            topicNamesAt = now;
            return descs;
        }

        synchronized void invalidateTopicCache() {
            topicDescsCache = Map.of();
            topicDescAt = 0;
            topicNamesCache = Set.of();
            topicNamesAt = 0;
            groupIdsCache = List.of();
            groupIdsAt = 0;
        }

        String endpointLabel() {
            return bootstrapServers + " · " + securityProtocol
                    + (username.isBlank() ? "" : " · sasl=" + saslMechanism);
        }

        String shortLabel() {
            if (name != null && !name.isBlank() && !name.equals(bootstrapServers)) return name;
            return shortBootstrapName(bootstrapServers);
        }

        Properties clientProps() {
            Properties p = new Properties();
            p.put("bootstrap.servers", bootstrapServers);
            p.put("client.id", clientId);
            p.put("request.timeout.ms", "15000");
            p.put("default.api.timeout.ms", "20000");
            p.put("security.protocol", securityProtocol);
            if (securityProtocol.contains("SASL")) {
                p.put("sasl.mechanism", saslMechanism);
                String user = username.replace("\\", "\\\\").replace("\"", "\\\"");
                String pass = password.replace("\\", "\\\\").replace("\"", "\\\"");
                p.put("sasl.jaas.config",
                        "org.apache.kafka.common.security.plain.PlainLoginModule required username=\""
                                + user + "\" password=\"" + pass + "\";");
                if (saslMechanism.startsWith("SCRAM")) {
                    p.put("sasl.jaas.config",
                            "org.apache.kafka.common.security.scram.ScramLoginModule required username=\""
                                    + user + "\" password=\"" + pass + "\";");
                }
            }
            return p;
        }

        synchronized void ensure() {
            long now = System.currentTimeMillis();
            // Hot path: reused AdminClient within TTL — skip extra describeCluster ping.
            if (admin != null && lastEnsureOkAt > 0 && (now - lastEnsureOkAt) < ENSURE_TTL_MS) {
                return;
            }
            if (admin != null) {
                try {
                    admin.describeCluster().nodes().get(5, TimeUnit.SECONDS);
                    lastEnsureOkAt = System.currentTimeMillis();
                    return;
                } catch (Exception e) {
                    closeQuietly();
                }
            }
            admin = AdminClient.create(clientProps());
            try {
                admin.describeCluster().nodes().get(ADMIN_TIMEOUT_SEC, TimeUnit.SECONDS);
                lastEnsureOkAt = System.currentTimeMillis();
            } catch (Exception e) {
                closeQuietly();
                throw new IllegalStateException("Cannot reach Kafka: " + msg(e), e);
            }
        }

        synchronized void invalidateGroupCache() {
            groupIdsCache = List.of();
            groupIdsAt = 0;
        }

        synchronized void closeQuietly() {
            if (admin != null) {
                try { admin.close(Duration.ofSeconds(3)); } catch (Exception ignored) { }
                admin = null;
            }
            lastEnsureOkAt = 0;
            topicDescsCache = Map.of();
            topicDescAt = 0;
            topicNamesCache = Set.of();
            topicNamesAt = 0;
            groupIdsCache = List.of();
            groupIdsAt = 0;
        }
    }
}
