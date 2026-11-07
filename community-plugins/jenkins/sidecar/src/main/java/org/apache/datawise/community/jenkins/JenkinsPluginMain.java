package org.apache.datawise.community.jenkins;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.datawise.plugin.sdk.StdioJsonRpcSidecar;

import java.nio.file.Path;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Jenkins Ops community plugin sidecar (stdio-jsonl).
 */
public final class JenkinsPluginMain extends StdioJsonRpcSidecar {

    private final Map<String, Session> sessions = new ConcurrentHashMap<>();

    public static void main(String[] args) throws Exception {
        new JenkinsPluginMain().runStdio();
    }

    @Override
    protected JsonNode handle(String method, JsonNode params) throws Exception {
        return switch (method) {
            case "plugin/initialize" -> okInit();
            case "connection/test" -> test(params.path("connection"));
            case "connection/connect" -> connect(params.path("connection"));
            case "connection/disconnect" -> disconnect(params);
            case "jenkins/info" -> info(params);
            case "jenkins/overview" -> overview(params);
            case "jenkins/views/list" -> viewsList(params);
            case "jenkins/jobs/list" -> jobsList(params);
            case "jenkins/jobs/describe" -> jobsDescribe(params);
            case "jenkins/jobs/trigger" -> jobsTrigger(params);
            case "jenkins/builds/stop" -> buildsStop(params);
            case "jenkins/builds/log" -> buildsLog(params);
            case "jenkins/builds/artifacts" -> buildsArtifacts(params);
            case "jenkins/builds/download" -> buildsDownload(params);
            case "jenkins/fs/reveal" -> fsReveal(params);
            case "jenkins/nodes/list" -> nodesList(params);
            case "jenkins/queue/list" -> queueList(params);
            default -> throw new UnknownMethodException(method);
        };
    }

    private ObjectNode okInit() {
        ObjectNode ok = mapper().createObjectNode();
        ok.put("ok", true);
        ok.put("name", "Jenkins Ops");
        ok.put("version", "0.3.27");
        return ok;
    }

    private ObjectNode test(JsonNode connection) throws Exception {
        JenkinsConfig config = JenkinsConfig.fromConnection(connection);
        JenkinsClient client = new JenkinsClient(config);
        JenkinsClient.InfoResponse info = client.info();
        ObjectNode ok = mapper().createObjectNode();
        ok.put("success", true);
        String version = info.version() != null ? info.version() : text(info.root(), "nodeName");
        ok.put("message", "Connected to Jenkins" + (version != null && !version.isBlank() ? " " + version : "")
                + " @ " + config.baseUrl());
        return ok;
    }

    private ObjectNode connect(JsonNode connection) throws Exception {
        JenkinsConfig config = JenkinsConfig.fromConnection(connection);
        JenkinsClient client = new JenkinsClient(config);
        JenkinsClient.InfoResponse info = client.info();
        sessions.put(config.id(), new Session(config, client));
        ObjectNode ok = mapper().createObjectNode();
        ok.put("success", true);
        ok.put("handle", "jenkins-" + config.id());
        if (info.version() != null) {
            ok.put("version", info.version());
        }
        ok.put("baseUrl", config.baseUrl());
        ok.put("readOnly", config.readOnly());
        return ok;
    }

    private ObjectNode disconnect(JsonNode params) {
        String id = resolveConnectionId(params);
        sessions.remove(id);
        ObjectNode ok = mapper().createObjectNode();
        ok.put("success", true);
        return ok;
    }

    private ObjectNode info(JsonNode params) throws Exception {
        Session session = requireSession(params);
        JenkinsClient.InfoResponse info = session.client.info();
        ObjectNode out = mapper().createObjectNode();
        out.put("baseUrl", session.config.baseUrl());
        out.put("readOnly", session.config.readOnly());
        out.put("downloadDir", session.config.downloadDir().toString());
        if (info.version() != null) {
            out.put("version", info.version());
        }
        out.put("nodeName", text(info.root(), "nodeName"));
        out.put("mode", text(info.root(), "mode"));
        out.put("numExecutors", info.root().path("numExecutors").asInt(0));
        out.put("quietingDown", info.root().path("quietingDown").asBoolean(false));
        return out;
    }

    /** One-shot dashboard payload: controller health + queue + agents + hot jobs. */
    private ObjectNode overview(JsonNode params) throws Exception {
        Session session = requireSession(params);
        JenkinsClient.InfoResponse info = session.client.info();
        JsonNode queue = session.client.listQueue();
        JsonNode computers = session.client.listNodes();
        JsonNode jobsRoot = session.client.listJobChildren(null);

        ObjectNode out = mapper().createObjectNode();
        out.put("baseUrl", session.config.baseUrl());
        out.put("readOnly", session.config.readOnly());
        out.put("downloadDir", session.config.downloadDir().toString());
        if (info.version() != null) {
            out.put("version", info.version());
        }
        out.put("nodeName", text(info.root(), "nodeName"));
        out.put("mode", text(info.root(), "mode"));
        out.put("numExecutors", info.root().path("numExecutors").asInt(0));
        out.put("quietingDown", info.root().path("quietingDown").asBoolean(false));

        int queueCount = 0;
        ArrayNode queueItems = out.putArray("queue");
        for (JsonNode item : JenkinsClient.array(queue, "items")) {
            queueCount++;
            if (queueItems.size() < 12) {
                queueItems.add(normalizeQueueItem(item));
            }
        }
        out.put("queueCount", queueCount);

        int offline = 0;
        int busyExec = 0;
        int totalExec = 0;
        for (JsonNode computer : JenkinsClient.array(computers, "computer")) {
            if (computer.path("offline").asBoolean(false) || computer.path("temporarilyOffline").asBoolean(false)) {
                offline++;
            }
            busyExec += computer.path("busyExecutors").asInt(0);
            totalExec += computer.path("numExecutors").asInt(0);
        }
        out.put("offlineNodes", offline);
        out.put("busyExecutors", busyExec);
        out.put("totalExecutors", totalExec > 0 ? totalExec : info.root().path("numExecutors").asInt(0));

        Set<String> pinSet = new HashSet<>();
        JsonNode pinsNode = params.path("pins");
        if (pinsNode.isArray()) {
            for (JsonNode p : pinsNode) {
                if (p != null && p.isTextual() && !p.asText().isBlank()) {
                    pinSet.add(p.asText().trim());
                }
            }
        }

        ArrayNode building = out.putArray("building");
        ArrayNode failing = out.putArray("failing");
        ArrayNode pinned = out.putArray("pinned");
        for (JsonNode job : JenkinsClient.array(jobsRoot, "jobs")) {
            if (JenkinsClient.isFolder(job)) {
                continue;
            }
            Map<String, Object> row = JenkinsClient.summarizeJob(job, "");
            boolean isBuilding = Boolean.TRUE.equals(row.get("lastBuildBuilding"))
                    || String.valueOf(row.getOrDefault("color", "")).endsWith("_anime");
            String result = String.valueOf(row.getOrDefault("lastBuildResult", ""));
            if (isBuilding && building.size() < 10) {
                building.add(mapper().valueToTree(row));
            } else if (("FAILURE".equalsIgnoreCase(result) || "FAILED".equalsIgnoreCase(result)
                    || "UNSTABLE".equalsIgnoreCase(result)) && failing.size() < 10) {
                failing.add(mapper().valueToTree(row));
            }
            String fullName = String.valueOf(row.getOrDefault("fullName", ""));
            if (!pinSet.isEmpty() && pinSet.contains(fullName) && pinned.size() < 40) {
                pinned.add(mapper().valueToTree(row));
            }
        }
        return out;
    }

    private ObjectNode viewsList(JsonNode params) throws Exception {
        Session session = requireSession(params);
        JsonNode root = session.client.listViews();
        ObjectNode out = mapper().createObjectNode();
        ArrayNode views = out.putArray("views");
        for (JsonNode view : JenkinsClient.array(root, "views")) {
            ObjectNode v = views.addObject();
            v.put("name", text(view, "name"));
            v.put("url", text(view, "url"));
            v.put("description", text(view, "description"));
        }
        return out;
    }

    private ObjectNode normalizeQueueItem(JsonNode item) {
        ObjectNode row = mapper().createObjectNode();
        row.put("id", item.path("id").asLong(0));
        row.put("blocked", item.path("blocked").asBoolean(false));
        row.put("buildable", item.path("buildable").asBoolean(false));
        row.put("inQueueSince", item.path("inQueueSince").asLong(0));
        row.put("why", text(item, "why"));
        JsonNode task = item.path("task");
        row.put("taskName", text(task, "fullName") != null ? text(task, "fullName") : text(task, "name"));
        row.put("taskUrl", text(task, "url"));
        return row;
    }

    private ObjectNode jobsList(JsonNode params) throws Exception {
        Session session = requireSession(params);
        String folder = text(params, "folder");
        String view = text(params, "view");
        boolean browse = params.path("browse").asBoolean(false);
        JsonNode root;
        if (view != null && !view.isBlank()) {
            root = browse
                    ? session.client.listJobChildrenInView(view)
                    : session.client.listJobsInView(view);
        } else if (browse || (folder != null && !folder.isBlank())) {
            root = session.client.listJobChildren(folder);
        } else {
            root = session.client.listJobsTree();
        }
        ObjectNode out = mapper().createObjectNode();
        ArrayNode jobs = out.putArray("jobs");
        if (browse || (folder != null && !folder.isBlank()) || (view != null && !view.isBlank() && browse)) {
            String parent = folder != null ? folder : "";
            for (JsonNode job : JenkinsClient.array(root, "jobs")) {
                jobs.add(mapper().valueToTree(JenkinsClient.summarizeJob(job, parent)));
            }
        } else {
            for (Map<String, Object> row : JenkinsClient.flattenJobs(root)) {
                jobs.add(mapper().valueToTree(row));
            }
        }
        return out;
    }

    private ObjectNode jobsDescribe(JsonNode params) throws Exception {
        Session session = requireSession(params);
        String jobName = requireText(params, "jobName");
        JsonNode detail = session.client.describeJob(jobName);
        ObjectNode out = mapper().createObjectNode();
        out.set("job", detail);
        ArrayNode parameters = out.putArray("parameters");
        for (JsonNode prop : JenkinsClient.array(detail, "property")) {
            for (JsonNode def : JenkinsClient.array(prop, "parameterDefinitions")) {
                ObjectNode p = parameters.addObject();
                p.put("name", text(def, "name"));
                p.put("type", text(def, "type"));
                p.put("description", text(def, "description"));
                p.put("className", text(def, "_class"));
                JsonNode defVal = def.path("defaultParameterValue").path("value");
                if (!defVal.isMissingNode() && !defVal.isNull()) {
                    p.put("defaultValue", defVal.asText(""));
                }
                ArrayNode choices = p.putArray("choices");
                for (JsonNode c : JenkinsClient.array(def, "choices")) {
                    choices.add(c.asText(""));
                }
            }
        }
        return out;
    }

    private ObjectNode jobsTrigger(JsonNode params) throws Exception {
        Session session = requireSession(params);
        String jobName = requireText(params, "jobName");
        Map<String, String> parameters = readStringMap(params.path("parameters"));
        JenkinsClient.TriggerResponse response = session.client.triggerBuild(jobName, parameters);
        ObjectNode out = mapper().createObjectNode();
        out.put("ok", true);
        if (response.queueUrl() != null) {
            out.put("queueUrl", response.queueUrl());
        }
        return out;
    }

    private ObjectNode buildsStop(JsonNode params) throws Exception {
        Session session = requireSession(params);
        String jobName = requireText(params, "jobName");
        int buildNumber = params.path("buildNumber").asInt(0);
        if (buildNumber <= 0) {
            throw new IllegalArgumentException("buildNumber is required");
        }
        session.client.stopBuild(jobName, buildNumber);
        ObjectNode out = mapper().createObjectNode();
        out.put("ok", true);
        return out;
    }

    private ObjectNode buildsLog(JsonNode params) throws Exception {
        Session session = requireSession(params);
        String jobName = requireText(params, "jobName");
        int buildNumber = params.path("buildNumber").asInt(0);
        if (buildNumber <= 0) {
            throw new IllegalArgumentException("buildNumber is required");
        }
        int start = Math.max(0, params.path("start").asInt(0));
        JenkinsClient.ProgressiveLog log = session.client.progressiveLog(jobName, buildNumber, start);
        ObjectNode out = mapper().createObjectNode();
        out.put("text", log.text());
        out.put("more", log.moreData());
        out.put("next", log.nextStart());
        return out;
    }

    private ObjectNode buildsArtifacts(JsonNode params) throws Exception {
        Session session = requireSession(params);
        String jobName = requireText(params, "jobName");
        int buildNumber = params.path("buildNumber").asInt(0);
        if (buildNumber <= 0) {
            throw new IllegalArgumentException("buildNumber is required");
        }
        List<JenkinsClient.ArtifactInfo> artifacts = session.client.listArtifacts(jobName, buildNumber);
        ObjectNode out = mapper().createObjectNode();
        ArrayNode arr = out.putArray("artifacts");
        for (JenkinsClient.ArtifactInfo a : artifacts) {
            ObjectNode item = arr.addObject();
            item.put("fileName", a.fileName());
            item.put("relativePath", a.relativePath());
            if (a.displayPath() != null) {
                item.put("displayPath", a.displayPath());
            }
            if (a.sizeBytes() != null) {
                item.put("sizeBytes", a.sizeBytes());
            }
        }
        return out;
    }

    private ObjectNode buildsDownload(JsonNode params) throws Exception {
        Session session = requireSession(params);
        String jobName = requireText(params, "jobName");
        int buildNumber = params.path("buildNumber").asInt(0);
        String relativePath = requireText(params, "relativePath");
        if (buildNumber <= 0) {
            throw new IllegalArgumentException("buildNumber is required");
        }
        Path path = session.client.downloadArtifact(jobName, buildNumber, relativePath);
        ObjectNode out = mapper().createObjectNode();
        out.put("ok", true);
        out.put("path", path.toString());
        try {
            out.put("sizeBytes", java.nio.file.Files.size(path));
        } catch (Exception ignored) {
            // optional
        }
        if (path.getParent() != null) {
            out.put("dir", path.getParent().toString());
        }
        return out;
    }

    private ObjectNode fsReveal(JsonNode params) throws Exception {
        Session session = requireSession(params);
        String path = requireText(params, "path");
        session.client.revealPath(path);
        ObjectNode out = mapper().createObjectNode();
        out.put("ok", true);
        return out;
    }

    private ObjectNode nodesList(JsonNode params) throws Exception {
        Session session = requireSession(params);
        JsonNode root = session.client.listNodes();
        ObjectNode out = mapper().createObjectNode();
        ArrayNode nodes = out.putArray("nodes");
        for (JsonNode computer : JenkinsClient.array(root, "computer")) {
            ObjectNode n = nodes.addObject();
            n.put("displayName", text(computer, "displayName"));
            n.put("description", text(computer, "description"));
            n.put("offline", computer.path("offline").asBoolean(false));
            n.put("temporarilyOffline", computer.path("temporarilyOffline").asBoolean(false));
            n.put("idle", computer.path("idle").asBoolean(false));
            n.put("numExecutors", computer.path("numExecutors").asInt(0));
            n.put("busyExecutors", computer.path("busyExecutors").asInt(0));
            n.put("offlineCauseReason", text(computer, "offlineCauseReason"));
            ArrayNode labels = n.putArray("labels");
            for (JsonNode label : JenkinsClient.array(computer, "assignedLabels")) {
                String name = text(label, "name");
                if (name != null) {
                    labels.add(name);
                }
            }
        }
        return out;
    }

    private ObjectNode queueList(JsonNode params) throws Exception {
        Session session = requireSession(params);
        JsonNode root = session.client.listQueue();
        ObjectNode out = mapper().createObjectNode();
        ArrayNode items = out.putArray("items");
        for (JsonNode item : JenkinsClient.array(root, "items")) {
            items.add(normalizeQueueItem(item));
        }
        out.put("count", items.size());
        return out;
    }

    private Session requireSession(JsonNode params) {
        String id = resolveConnectionId(params);
        Session session = sessions.get(id);
        if (session == null) {
            // Lazy reconnect from embedded connection object when host re-invokes after restart.
            JsonNode connection = params.path("connection");
            if (connection.isObject() && !connection.isEmpty()) {
                try {
                    JenkinsConfig config = JenkinsConfig.fromConnection(connection);
                    JenkinsClient client = new JenkinsClient(config);
                    session = new Session(config, client);
                    sessions.put(config.id(), session);
                    return session;
                } catch (Exception ex) {
                    throw new IllegalStateException("Not connected: " + id + " (" + ex.getMessage() + ")");
                }
            }
            throw new IllegalStateException("Not connected: " + id + ". Reconnect the Jenkins connection.");
        }
        return session;
    }

    private static String resolveConnectionId(JsonNode params) {
        String id = text(params, "connectionId");
        if (id != null) {
            return id;
        }
        id = text(params.path("connection"), "id");
        return id != null ? id : "anon";
    }

    private static String requireText(JsonNode params, String field) {
        String value = text(params, field);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value;
    }

    private static String text(JsonNode node, String field) {
        if (node == null || node.isMissingNode() || node.isNull() || !node.has(field)) {
            return null;
        }
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        String text = value.asText(null);
        return text != null && !text.isBlank() ? text.trim() : null;
    }

    private static Map<String, String> readStringMap(JsonNode node) {
        Map<String, String> out = new LinkedHashMap<>();
        if (node == null || !node.isObject()) {
            return out;
        }
        Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            if (entry.getKey() == null || entry.getKey().isBlank()) {
                continue;
            }
            JsonNode value = entry.getValue();
            out.put(entry.getKey(), value == null || value.isNull() ? "" : value.asText(""));
        }
        return out;
    }

    private record Session(JenkinsConfig config, JenkinsClient client) {
    }
}
