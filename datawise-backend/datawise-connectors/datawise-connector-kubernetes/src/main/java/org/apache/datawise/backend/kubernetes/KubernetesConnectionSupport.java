package org.apache.datawise.backend.kubernetes;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.domain.K8sApplyResultDto;
import org.apache.datawise.backend.domain.K8sAppliedResourceDto;
import org.apache.datawise.backend.domain.K8sClusterInfoDto;
import org.apache.datawise.backend.domain.K8sConfigMapDto;
import org.apache.datawise.backend.domain.K8sConfigMapsResultDto;
import org.apache.datawise.backend.domain.K8sContainerDto;
import org.apache.datawise.backend.domain.K8sCrdDto;
import org.apache.datawise.backend.domain.K8sCrdsResultDto;
import org.apache.datawise.backend.domain.K8sDeploymentDto;
import org.apache.datawise.backend.domain.K8sDeploymentsResultDto;
import org.apache.datawise.backend.domain.K8sEventDto;
import org.apache.datawise.backend.domain.K8sEventsResultDto;
import org.apache.datawise.backend.domain.K8sHelmReleaseDto;
import org.apache.datawise.backend.domain.K8sHelmReleasesResultDto;
import org.apache.datawise.backend.domain.K8sLogsDto;
import org.apache.datawise.backend.domain.K8sMutationResultDto;
import org.apache.datawise.backend.domain.K8sNamespaceDto;
import org.apache.datawise.backend.domain.K8sNamespacesResultDto;
import org.apache.datawise.backend.domain.K8sPodDetailDto;
import org.apache.datawise.backend.domain.K8sPodDto;
import org.apache.datawise.backend.domain.K8sPodsResultDto;
import org.apache.datawise.backend.domain.K8sSecretDto;
import org.apache.datawise.backend.domain.K8sSecretsResultDto;
import org.apache.datawise.backend.domain.K8sServiceDto;
import org.apache.datawise.backend.domain.K8sServicesResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.yaml.snakeyaml.Yaml;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public final class KubernetesConnectionSupport {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Set<String> FORBIDDEN_APPLY_KINDS = Set.of("secret");
    private static final Map<String, String> KIND_PLURALS = Map.ofEntries(
            Map.entry("pod", "pods"),
            Map.entry("service", "services"),
            Map.entry("configmap", "configmaps"),
            Map.entry("secret", "secrets"),
            Map.entry("namespace", "namespaces"),
            Map.entry("persistentvolumeclaim", "persistentvolumeclaims"),
            Map.entry("deployment", "deployments"),
            Map.entry("statefulset", "statefulsets"),
            Map.entry("daemonset", "daemonsets"),
            Map.entry("replicaset", "replicasets"),
            Map.entry("job", "jobs"),
            Map.entry("cronjob", "cronjobs"),
            Map.entry("ingress", "ingresses"),
            Map.entry("horizontalpodautoscaler", "horizontalpodautoscalers"),
            Map.entry("serviceaccount", "serviceaccounts"),
            Map.entry("role", "roles"),
            Map.entry("rolebinding", "rolebindings"),
            Map.entry("clusterrole", "clusterroles"),
            Map.entry("clusterrolebinding", "clusterrolebindings")
    );

    private KubernetesConnectionSupport() {
    }

    public static K8sClusterInfoDto clusterInfo(ConnectionEntity entity) throws Exception {
        KubernetesRestClient client = new KubernetesRestClient(KubernetesConnectionConfig.from(entity));
        JsonNode version = client.version();
        return new K8sClusterInfoDto(
                KubernetesRestClient.text(version, "gitVersion"),
                KubernetesRestClient.text(version, "platform"),
                KubernetesRestClient.text(version, "major"),
                KubernetesRestClient.text(version, "minor")
        );
    }

    public static K8sNamespacesResultDto listNamespaces(ConnectionEntity entity, String nameFilter, int limit)
            throws Exception {
        KubernetesRestClient client = new KubernetesRestClient(KubernetesConnectionConfig.from(entity));
        int fetchLimit = limit > 0 ? Math.min(limit, 500) : 200;
        JsonNode root = client.listNamespaces(fetchLimit);
        String filter = nameFilter == null ? "" : nameFilter.trim().toLowerCase(Locale.ROOT);
        List<K8sNamespaceDto> namespaces = new ArrayList<>();
        for (JsonNode item : items(root)) {
            JsonNode meta = item.path("metadata");
            String name = KubernetesRestClient.text(meta, "name");
            if (name == null || name.isBlank()) {
                continue;
            }
            if (!filter.isEmpty() && !name.toLowerCase(Locale.ROOT).contains(filter)) {
                continue;
            }
            namespaces.add(new K8sNamespaceDto(
                    name,
                    KubernetesRestClient.text(item.path("status"), "phase"),
                    KubernetesRestClient.text(meta, "creationTimestamp")
            ));
            if (limit > 0 && namespaces.size() >= limit) {
                break;
            }
        }
        return new K8sNamespacesResultDto(List.copyOf(namespaces), namespaces.size());
    }

    public static K8sPodsResultDto listPods(
            ConnectionEntity entity,
            String namespace,
            String labelSelector,
            String fieldSelector,
            int limit
    ) throws Exception {
        // Blank / "_all" → cluster-scoped list (see KubernetesRestClient.listPods).
        KubernetesRestClient client = new KubernetesRestClient(KubernetesConnectionConfig.from(entity));
        int fetchLimit = limit > 0 ? Math.min(limit, 500) : 200;
        JsonNode root = client.listPods(namespace, labelSelector, fieldSelector, fetchLimit);
        List<K8sPodDto> pods = new ArrayList<>();
        for (JsonNode item : items(root)) {
            pods.add(toPodSummary(item));
            if (limit > 0 && pods.size() >= limit) {
                break;
            }
        }
        return new K8sPodsResultDto(List.copyOf(pods), pods.size());
    }

    public static K8sPodDetailDto describePod(ConnectionEntity entity, String namespace, String podName)
            throws Exception {
        requireNamespace(namespace);
        requireName(podName, "podName");
        KubernetesRestClient client = new KubernetesRestClient(KubernetesConnectionConfig.from(entity));
        JsonNode pod = client.getPod(namespace, podName);
        JsonNode meta = pod.path("metadata");
        JsonNode status = pod.path("status");
        JsonNode spec = pod.path("spec");
        List<K8sContainerDto> containers = new ArrayList<>();
        Map<String, JsonNode> statusByName = new LinkedHashMap<>();
        for (JsonNode cs : status.path("containerStatuses")) {
            String name = KubernetesRestClient.text(cs, "name");
            if (name != null) {
                statusByName.put(name, cs);
            }
        }
        for (JsonNode container : spec.path("containers")) {
            String name = KubernetesRestClient.text(container, "name");
            JsonNode cs = name != null ? statusByName.get(name) : null;
            containers.add(new K8sContainerDto(
                    name,
                    KubernetesRestClient.text(container, "image"),
                    cs != null && KubernetesRestClient.boolValue(cs, "ready"),
                    cs != null ? KubernetesRestClient.intValue(cs, "restartCount") : 0,
                    cs != null ? containerState(cs.path("state")) : null
            ));
        }
        return new K8sPodDetailDto(
                KubernetesRestClient.text(meta, "name"),
                KubernetesRestClient.text(meta, "namespace"),
                KubernetesRestClient.text(status, "phase"),
                KubernetesRestClient.text(spec, "nodeName"),
                KubernetesRestClient.text(status, "podIP"),
                KubernetesRestClient.text(status, "hostIP"),
                totalRestarts(status),
                readyText(status),
                KubernetesRestClient.text(status, "reason"),
                KubernetesRestClient.text(status, "message"),
                KubernetesRestClient.text(meta, "creationTimestamp"),
                labels(meta.path("labels")),
                List.copyOf(containers)
        );
    }

    public static K8sDeploymentsResultDto listDeployments(
            ConnectionEntity entity,
            String namespace,
            String labelSelector,
            int limit
    ) throws Exception {
        // Blank / "_all" → cluster-scoped list.
        KubernetesRestClient client = new KubernetesRestClient(KubernetesConnectionConfig.from(entity));
        int fetchLimit = limit > 0 ? Math.min(limit, 500) : 200;
        JsonNode root = client.listDeployments(namespace, labelSelector, fetchLimit);
        List<K8sDeploymentDto> deployments = new ArrayList<>();
        for (JsonNode item : items(root)) {
            JsonNode meta = item.path("metadata");
            JsonNode status = item.path("status");
            JsonNode spec = item.path("spec");
            deployments.add(new K8sDeploymentDto(
                    KubernetesRestClient.text(meta, "name"),
                    KubernetesRestClient.text(meta, "namespace"),
                    KubernetesRestClient.intValue(spec, "replicas"),
                    KubernetesRestClient.intValue(status, "readyReplicas"),
                    KubernetesRestClient.intValue(status, "availableReplicas"),
                    KubernetesRestClient.intValue(status, "updatedReplicas"),
                    KubernetesRestClient.text(meta, "creationTimestamp")
            ));
            if (limit > 0 && deployments.size() >= limit) {
                break;
            }
        }
        return new K8sDeploymentsResultDto(List.copyOf(deployments), deployments.size());
    }

    public static K8sLogsDto podLogs(
            ConnectionEntity entity,
            String namespace,
            String podName,
            String container,
            int tailLines
    ) throws Exception {
        requireNamespace(namespace);
        requireName(podName, "podName");
        KubernetesRestClient client = new KubernetesRestClient(KubernetesConnectionConfig.from(entity));
        int lines = tailLines > 0 ? Math.min(tailLines, 5000) : 200;
        String content = client.podLogs(namespace, podName, container, lines);
        return new K8sLogsDto(namespace, podName, container, content != null ? content : "");
    }

    public static K8sEventsResultDto listEvents(
            ConnectionEntity entity,
            String namespace,
            String involvedName,
            int limit
    ) throws Exception {
        // Blank / "_all" → cluster-scoped list.
        KubernetesRestClient client = new KubernetesRestClient(KubernetesConnectionConfig.from(entity));
        String fieldSelector = null;
        if (involvedName != null && !involvedName.isBlank()) {
            fieldSelector = "involvedObject.name=" + involvedName.trim();
        }
        int fetchLimit = limit > 0 ? Math.min(limit, 500) : 100;
        JsonNode root = client.listEvents(namespace, fieldSelector, fetchLimit);
        List<K8sEventDto> events = new ArrayList<>();
        for (JsonNode item : items(root)) {
            JsonNode involved = item.path("involvedObject");
            events.add(new K8sEventDto(
                    KubernetesRestClient.text(item, "type"),
                    KubernetesRestClient.text(item, "reason"),
                    KubernetesRestClient.text(item, "message"),
                    KubernetesRestClient.text(involved, "kind"),
                    KubernetesRestClient.text(involved, "name"),
                    KubernetesRestClient.intValue(item, "count"),
                    firstNonBlank(
                            KubernetesRestClient.text(item, "lastTimestamp"),
                            KubernetesRestClient.text(item.path("metadata"), "creationTimestamp")
                    )
            ));
            if (limit > 0 && events.size() >= limit) {
                break;
            }
        }
        return new K8sEventsResultDto(List.copyOf(events), events.size());
    }

    public static K8sServicesResultDto listServices(
            ConnectionEntity entity,
            String namespace,
            String labelSelector,
            int limit
    ) throws Exception {
        // Blank / "_all" → cluster-scoped list.
        KubernetesRestClient client = new KubernetesRestClient(KubernetesConnectionConfig.from(entity));
        int fetchLimit = limit > 0 ? Math.min(limit, 500) : 200;
        JsonNode root = client.listServices(namespace, labelSelector, fetchLimit);
        List<K8sServiceDto> services = new ArrayList<>();
        for (JsonNode item : items(root)) {
            JsonNode meta = item.path("metadata");
            JsonNode spec = item.path("spec");
            services.add(new K8sServiceDto(
                    KubernetesRestClient.text(meta, "name"),
                    KubernetesRestClient.text(meta, "namespace"),
                    KubernetesRestClient.text(spec, "type"),
                    KubernetesRestClient.text(spec, "clusterIP"),
                    formatPorts(spec.path("ports")),
                    KubernetesRestClient.text(meta, "creationTimestamp")
            ));
            if (limit > 0 && services.size() >= limit) {
                break;
            }
        }
        return new K8sServicesResultDto(List.copyOf(services), services.size());
    }

    public static K8sConfigMapsResultDto listConfigMaps(
            ConnectionEntity entity,
            String namespace,
            String labelSelector,
            int limit
    ) throws Exception {
        // Blank / "_all" → cluster-scoped list.
        KubernetesRestClient client = new KubernetesRestClient(KubernetesConnectionConfig.from(entity));
        int fetchLimit = limit > 0 ? Math.min(limit, 500) : 200;
        JsonNode root = client.listConfigMaps(namespace, labelSelector, fetchLimit);
        List<K8sConfigMapDto> configMaps = new ArrayList<>();
        for (JsonNode item : items(root)) {
            JsonNode meta = item.path("metadata");
            List<String> keys = keyNames(item.path("data"));
            configMaps.add(new K8sConfigMapDto(
                    KubernetesRestClient.text(meta, "name"),
                    KubernetesRestClient.text(meta, "namespace"),
                    keys,
                    keys.size(),
                    KubernetesRestClient.text(meta, "creationTimestamp")
            ));
            if (limit > 0 && configMaps.size() >= limit) {
                break;
            }
        }
        return new K8sConfigMapsResultDto(List.copyOf(configMaps), configMaps.size());
    }

    public static K8sSecretsResultDto listSecrets(
            ConnectionEntity entity,
            String namespace,
            String labelSelector,
            int limit
    ) throws Exception {
        // Blank / "_all" → cluster-scoped list.
        KubernetesRestClient client = new KubernetesRestClient(KubernetesConnectionConfig.from(entity));
        int fetchLimit = limit > 0 ? Math.min(limit, 500) : 200;
        JsonNode root = client.listSecrets(namespace, labelSelector, fetchLimit);
        List<K8sSecretDto> secrets = new ArrayList<>();
        for (JsonNode item : items(root)) {
            JsonNode meta = item.path("metadata");
            // Metadata only: expose key names, never data values.
            List<String> keys = keyNames(item.path("data"));
            secrets.add(new K8sSecretDto(
                    KubernetesRestClient.text(meta, "name"),
                    KubernetesRestClient.text(meta, "namespace"),
                    KubernetesRestClient.text(item, "type"),
                    keys,
                    keys.size(),
                    KubernetesRestClient.text(meta, "creationTimestamp")
            ));
            if (limit > 0 && secrets.size() >= limit) {
                break;
            }
        }
        return new K8sSecretsResultDto(List.copyOf(secrets), secrets.size());
    }

    public static K8sCrdsResultDto listCrds(ConnectionEntity entity, String nameFilter, int limit) throws Exception {
        KubernetesRestClient client = new KubernetesRestClient(KubernetesConnectionConfig.from(entity));
        int fetchLimit = limit > 0 ? Math.min(limit, 500) : 200;
        JsonNode root = client.listCrds(fetchLimit);
        String filter = nameFilter == null ? "" : nameFilter.trim().toLowerCase(Locale.ROOT);
        List<K8sCrdDto> crds = new ArrayList<>();
        for (JsonNode item : items(root)) {
            JsonNode meta = item.path("metadata");
            JsonNode spec = item.path("spec");
            String name = KubernetesRestClient.text(meta, "name");
            if (name == null || name.isBlank()) {
                continue;
            }
            if (!filter.isEmpty() && !name.toLowerCase(Locale.ROOT).contains(filter)) {
                continue;
            }
            String version = preferredVersion(spec.path("versions"));
            crds.add(new K8sCrdDto(
                    name,
                    KubernetesRestClient.text(spec, "group"),
                    version,
                    KubernetesRestClient.text(spec.path("names"), "kind"),
                    KubernetesRestClient.text(spec, "scope"),
                    KubernetesRestClient.text(meta, "creationTimestamp")
            ));
            if (limit > 0 && crds.size() >= limit) {
                break;
            }
        }
        return new K8sCrdsResultDto(List.copyOf(crds), crds.size());
    }

    public static K8sHelmReleasesResultDto listHelmReleases(ConnectionEntity entity, String namespace, int limit)
            throws Exception {
        // Blank / "_all" → cluster-scoped Helm secret scan.
        KubernetesRestClient client = new KubernetesRestClient(KubernetesConnectionConfig.from(entity));
        int fetchLimit = Math.max(limit > 0 ? Math.min(limit * 4, 500) : 200, 50);
        JsonNode root = client.listSecrets(namespace, "owner=helm", fetchLimit);
        Map<String, K8sHelmReleaseDto> latestByName = new LinkedHashMap<>();
        for (JsonNode item : items(root)) {
            JsonNode meta = item.path("metadata");
            Map<String, String> labels = labels(meta.path("labels"));
            String releaseName = labels.getOrDefault("name", KubernetesRestClient.text(meta, "name"));
            if (releaseName == null || releaseName.isBlank()) {
                continue;
            }
            int revision = parseIntSafe(labels.get("version"), 0);
            K8sHelmReleaseDto current = latestByName.get(releaseName);
            if (current != null && current.revision() >= revision) {
                continue;
            }
            latestByName.put(releaseName, new K8sHelmReleaseDto(
                    releaseName,
                    KubernetesRestClient.text(meta, "namespace"),
                    labels.getOrDefault("status", ""),
                    labels.getOrDefault("chart", ""),
                    labels.getOrDefault("appVersion", labels.getOrDefault("app.kubernetes.io/version", "")),
                    revision,
                    KubernetesRestClient.text(meta, "creationTimestamp")
            ));
        }
        List<K8sHelmReleaseDto> releases = new ArrayList<>(latestByName.values());
        if (limit > 0 && releases.size() > limit) {
            releases = releases.subList(0, limit);
        }
        return new K8sHelmReleasesResultDto(List.copyOf(releases), releases.size());
    }

    public static K8sApplyResultDto applyYaml(ConnectionEntity entity, String yaml, String defaultNamespace)
            throws Exception {
        if (yaml == null || yaml.isBlank()) {
            throw new IllegalArgumentException("yaml is required");
        }
        String fallbackNs = defaultNamespace == null || defaultNamespace.isBlank() ? "default" : defaultNamespace.trim();
        KubernetesRestClient client = new KubernetesRestClient(KubernetesConnectionConfig.from(entity));
        List<K8sAppliedResourceDto> applied = new ArrayList<>();
        Yaml parser = new Yaml();
        Iterable<Object> docs = parser.loadAll(yaml);
        for (Object doc : docs) {
            if (doc == null) {
                continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> map = doc instanceof Map<?, ?> m ? (Map<String, Object>) m : null;
            if (map == null || map.isEmpty()) {
                continue;
            }
            JsonNode node = MAPPER.valueToTree(map);
            String apiVersion = KubernetesRestClient.text(node, "apiVersion");
            String kind = KubernetesRestClient.text(node, "kind");
            JsonNode meta = node.path("metadata");
            String name = KubernetesRestClient.text(meta, "name");
            String ns = firstNonBlank(KubernetesRestClient.text(meta, "namespace"), fallbackNs);
            if (apiVersion == null || apiVersion.isBlank() || kind == null || kind.isBlank()
                    || name == null || name.isBlank()) {
                applied.add(new K8sAppliedResourceDto(
                        apiVersion, kind, ns, name, "skip", false,
                        "Document missing apiVersion/kind/metadata.name"
                ));
                continue;
            }
            if (FORBIDDEN_APPLY_KINDS.contains(kind.toLowerCase(Locale.ROOT))) {
                applied.add(new K8sAppliedResourceDto(
                        apiVersion, kind, ns, name, "denied", false,
                        "Applying Secret manifests is not allowed; manage secrets outside Datawise"
                ));
                continue;
            }
            try {
                String path = resourcePath(apiVersion, kind, ns, name);
                String docYaml = toYamlDocument(map);
                client.applyPatchYaml(path, docYaml);
                applied.add(new K8sAppliedResourceDto(apiVersion, kind, ns, name, "applied", true, "OK"));
            } catch (Exception ex) {
                applied.add(new K8sAppliedResourceDto(
                        apiVersion, kind, ns, name, "error", false,
                        ex.getMessage() != null ? ex.getMessage() : "apply failed"
                ));
            }
        }
        boolean allOk = !applied.isEmpty() && applied.stream().allMatch(K8sAppliedResourceDto::success);
        String message = applied.isEmpty()
                ? "No resources found in YAML"
                : (allOk ? "Applied " + applied.size() + " resource(s)" : "Apply finished with errors");
        return new K8sApplyResultDto(allOk, message, List.copyOf(applied));
    }

    public static K8sMutationResultDto deletePod(ConnectionEntity entity, String namespace, String podName)
            throws Exception {
        requireNamespace(namespace);
        requireName(podName, "podName");
        KubernetesRestClient client = new KubernetesRestClient(KubernetesConnectionConfig.from(entity));
        client.deletePod(namespace, podName);
        return new K8sMutationResultDto(true, "Delete requested for pod " + podName, "Terminating");
    }

    public static K8sMutationResultDto restartDeployment(
            ConnectionEntity entity,
            String namespace,
            String deploymentName
    ) throws Exception {
        requireNamespace(namespace);
        requireName(deploymentName, "deploymentName");
        KubernetesRestClient client = new KubernetesRestClient(KubernetesConnectionConfig.from(entity));
        client.restartDeployment(namespace, deploymentName);
        return new K8sMutationResultDto(true, "Restart annotation applied to deployment " + deploymentName, "Restarting");
    }

    private static K8sPodDto toPodSummary(JsonNode item) {
        JsonNode meta = item.path("metadata");
        JsonNode status = item.path("status");
        JsonNode spec = item.path("spec");
        return new K8sPodDto(
                KubernetesRestClient.text(meta, "name"),
                KubernetesRestClient.text(meta, "namespace"),
                KubernetesRestClient.text(status, "phase"),
                KubernetesRestClient.text(spec, "nodeName"),
                KubernetesRestClient.text(status, "podIP"),
                totalRestarts(status),
                readyText(status),
                KubernetesRestClient.text(meta, "creationTimestamp")
        );
    }

    private static List<JsonNode> items(JsonNode root) {
        JsonNode items = root.path("items");
        if (!items.isArray()) {
            return List.of();
        }
        List<JsonNode> list = new ArrayList<>();
        for (JsonNode item : items) {
            list.add(item);
        }
        return list;
    }

    private static int totalRestarts(JsonNode status) {
        int total = 0;
        for (JsonNode cs : status.path("containerStatuses")) {
            total += KubernetesRestClient.intValue(cs, "restartCount");
        }
        return total;
    }

    private static String readyText(JsonNode status) {
        int ready = 0;
        int total = 0;
        for (JsonNode cs : status.path("containerStatuses")) {
            total++;
            if (KubernetesRestClient.boolValue(cs, "ready")) {
                ready++;
            }
        }
        if (total == 0) {
            for (JsonNode ignored : status.path("containerStatuses")) {
                // no-op fallback
            }
            JsonNode init = status.path("initContainerStatuses");
            if (!init.isArray() || init.isEmpty()) {
                return "0/0";
            }
        }
        return ready + "/" + total;
    }

    private static String containerState(JsonNode state) {
        if (state == null || state.isMissingNode() || state.isNull()) {
            return null;
        }
        Iterator<String> fields = state.fieldNames();
        if (fields.hasNext()) {
            return fields.next();
        }
        return null;
    }

    private static Map<String, String> labels(JsonNode labelsNode) {
        if (labelsNode == null || !labelsNode.isObject()) {
            return Map.of();
        }
        Map<String, String> labels = new LinkedHashMap<>();
        Iterator<Map.Entry<String, JsonNode>> it = labelsNode.fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> entry = it.next();
            labels.put(entry.getKey(), entry.getValue().asText(""));
        }
        return Map.copyOf(labels);
    }

    private static void requireNamespace(String namespace) {
        if (namespace == null || namespace.isBlank()) {
            throw new IllegalArgumentException("namespace is required");
        }
    }

    private static void requireName(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required");
        }
    }

    private static String firstNonBlank(String first, String second) {
        if (first != null && !first.isBlank()) {
            return first;
        }
        return second;
    }

    private static List<String> keyNames(JsonNode dataNode) {
        if (dataNode == null || !dataNode.isObject()) {
            return List.of();
        }
        List<String> keys = new ArrayList<>();
        Iterator<String> it = dataNode.fieldNames();
        while (it.hasNext()) {
            keys.add(it.next());
        }
        return List.copyOf(keys);
    }

    private static String formatPorts(JsonNode ports) {
        if (ports == null || !ports.isArray() || ports.isEmpty()) {
            return "";
        }
        List<String> parts = new ArrayList<>();
        for (JsonNode port : ports) {
            String name = KubernetesRestClient.text(port, "name");
            int portNum = KubernetesRestClient.intValue(port, "port");
            int target = KubernetesRestClient.intValue(port, "targetPort");
            String protocol = KubernetesRestClient.text(port, "protocol");
            StringBuilder sb = new StringBuilder();
            if (name != null && !name.isBlank()) {
                sb.append(name).append(':');
            }
            sb.append(portNum);
            if (target > 0 && target != portNum) {
                sb.append("->").append(target);
            }
            if (protocol != null && !protocol.isBlank() && !"TCP".equalsIgnoreCase(protocol)) {
                sb.append('/').append(protocol);
            }
            parts.add(sb.toString());
        }
        return String.join(", ", parts);
    }

    private static String preferredVersion(JsonNode versions) {
        if (versions == null || !versions.isArray()) {
            return null;
        }
        String fallback = null;
        for (JsonNode version : versions) {
            String name = KubernetesRestClient.text(version, "name");
            if (name == null) {
                continue;
            }
            if (fallback == null) {
                fallback = name;
            }
            if (KubernetesRestClient.boolValue(version, "storage")) {
                return name;
            }
        }
        return fallback;
    }

    private static int parseIntSafe(String value, int defaultValue) {
        if (value == null || value.isBlank()) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException ex) {
            return defaultValue;
        }
    }

    private static String resourcePath(String apiVersion, String kind, String namespace, String name) {
        String plural = pluralize(kind);
        boolean namespaced = !"Namespace".equalsIgnoreCase(kind)
                && !"PersistentVolume".equalsIgnoreCase(kind)
                && !"ClusterRole".equalsIgnoreCase(kind)
                && !"ClusterRoleBinding".equalsIgnoreCase(kind)
                && !"CustomResourceDefinition".equalsIgnoreCase(kind);
        String apiRoot;
        if ("v1".equals(apiVersion)) {
            apiRoot = "/api/v1";
        } else {
            apiRoot = "/apis/" + apiVersion;
        }
        if ("namespaces".equals(plural)) {
            return apiRoot + "/namespaces/" + encodePathSegment(name);
        }
        if (!namespaced) {
            return apiRoot + "/" + plural + "/" + encodePathSegment(name);
        }
        return apiRoot + "/namespaces/" + encodePathSegment(namespace) + "/" + plural + "/" + encodePathSegment(name);
    }

    private static String pluralize(String kind) {
        String key = kind == null ? "" : kind.toLowerCase(Locale.ROOT);
        String mapped = KIND_PLURALS.get(key);
        if (mapped != null) {
            return mapped;
        }
        if (key.endsWith("s") || key.endsWith("x") || key.endsWith("ch") || key.endsWith("sh")) {
            return key + "es";
        }
        if (key.endsWith("y") && key.length() > 1) {
            return key.substring(0, key.length() - 1) + "ies";
        }
        return key + "s";
    }

    private static String encodePathSegment(String value) {
        return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String toYamlDocument(Map<String, Object> map) {
        return new Yaml().dump(map);
    }
}
