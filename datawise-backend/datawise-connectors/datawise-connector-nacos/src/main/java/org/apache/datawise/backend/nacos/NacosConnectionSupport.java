package org.apache.datawise.backend.nacos;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.datawise.backend.domain.NacosConfigContentDto;
import org.apache.datawise.backend.domain.NacosConfigDto;
import org.apache.datawise.backend.domain.NacosConfigsResultDto;
import org.apache.datawise.backend.domain.NacosInfoDto;
import org.apache.datawise.backend.domain.NacosInstanceDto;
import org.apache.datawise.backend.domain.NacosInstancesResultDto;
import org.apache.datawise.backend.domain.NacosNamespaceDto;
import org.apache.datawise.backend.domain.NacosNamespacesResultDto;
import org.apache.datawise.backend.domain.NacosServiceDto;
import org.apache.datawise.backend.domain.NacosServicesResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.ArrayList;
import java.util.List;

public final class NacosConnectionSupport {

    private NacosConnectionSupport() {
    }

    public static NacosInfoDto info(ConnectionEntity entity) throws Exception {
        NacosConnectionConfig config = NacosConnectionConfig.from(entity);
        NacosRestClient client = new NacosRestClient(config);
        client.ensureLogin();
        NacosNamespacesResultDto namespaces = listNamespaces(entity);
        return new NacosInfoDto(
                entity != null ? entity.getHost() : null,
                config.baseUrl(),
                config.hasCredentials(),
                namespaces.totalCount()
        );
    }

    public static NacosNamespacesResultDto listNamespaces(ConnectionEntity entity) throws Exception {
        NacosRestClient client = new NacosRestClient(NacosConnectionConfig.from(entity));
        JsonNode root = client.listNamespaces();
        List<NacosNamespaceDto> namespaces = new ArrayList<>();
        for (JsonNode item : NacosRestClient.array(root, "data")) {
            String namespace = NacosRestClient.firstText(item, "namespace", "namespaceId", "tenant");
            if (namespace == null) {
                namespace = "";
            }
            namespaces.add(new NacosNamespaceDto(
                    namespace,
                    NacosRestClient.firstText(item, "namespaceShowName", "namespaceName", "showName"),
                    NacosRestClient.firstText(item, "namespaceDesc", "namespaceDescription", "desc"),
                    NacosRestClient.intValue(item, "quota"),
                    NacosRestClient.intValue(item, "configCount"),
                    NacosRestClient.intValue(item, "type")
            ));
        }
        return new NacosNamespacesResultDto(List.copyOf(namespaces), namespaces.size());
    }

    public static NacosConfigsResultDto listConfigs(
            ConnectionEntity entity,
            String namespaceId,
            String dataId,
            String group,
            int limit
    ) throws Exception {
        NacosRestClient client = new NacosRestClient(NacosConnectionConfig.from(entity));
        int pageSize = Math.max(1, limit);
        JsonNode root = client.listConfigs(dataId, group, blankToEmpty(namespaceId), pageSize);
        JsonNode body = NacosRestClient.unwrapDataObject(root);
        List<NacosConfigDto> configs = new ArrayList<>();
        JsonNode pageItems = body.path("pageItems");
        Iterable<JsonNode> items = pageItems.isArray()
                ? pageItems
                : NacosRestClient.array(body.isArray() ? root : body, "data");
        for (JsonNode item : items) {
            String id = NacosRestClient.firstText(item, "dataId", "data_id");
            if (id == null || id.isBlank()) {
                continue;
            }
            configs.add(new NacosConfigDto(
                    id,
                    NacosRestClient.firstText(item, "group", "groupName"),
                    NacosRestClient.firstText(item, "tenant", "namespaceId", "namespace"),
                    NacosRestClient.firstText(item, "type", "configType"),
                    NacosRestClient.firstText(item, "appName", "app"),
                    NacosRestClient.firstText(item, "md5", "contentMd5")
            ));
        }
        int total = body.has("totalCount")
                ? NacosRestClient.intValue(body, "totalCount")
                : (root.has("totalCount") ? NacosRestClient.intValue(root, "totalCount") : configs.size());
        return new NacosConfigsResultDto(List.copyOf(configs), total, pageSize);
    }

    public static NacosConfigContentDto getConfig(
            ConnectionEntity entity,
            String dataId,
            String group,
            String namespaceId
    ) throws Exception {
        if (dataId == null || dataId.isBlank()) {
            throw new IllegalArgumentException("dataId is required");
        }
        NacosRestClient client = new NacosRestClient(NacosConnectionConfig.from(entity));
        JsonNode root = client.getConfig(dataId.trim(), group, blankToEmpty(namespaceId));
        JsonNode body = NacosRestClient.unwrapDataObject(root);
        // Some Nacos versions return plain text content; Jackson may wrap it as textual root.
        if (body != null && body.isTextual()) {
            return new NacosConfigContentDto(
                    dataId.trim(),
                    group != null && !group.isBlank() ? group : "DEFAULT_GROUP",
                    blankToEmpty(namespaceId),
                    body.asText(),
                    null,
                    null,
                    null
            );
        }
        String content = NacosRestClient.firstText(body, "content", "configDetail");
        if (content == null && body != null && !body.isObject()) {
            content = body.asText(null);
        }
        return new NacosConfigContentDto(
                NacosRestClient.firstText(body, "dataId", "data_id") != null
                        ? NacosRestClient.firstText(body, "dataId", "data_id")
                        : dataId.trim(),
                NacosRestClient.firstText(body, "group", "groupName") != null
                        ? NacosRestClient.firstText(body, "group", "groupName")
                        : (group != null && !group.isBlank() ? group : "DEFAULT_GROUP"),
                NacosRestClient.firstText(body, "tenant", "namespaceId", "namespace") != null
                        ? NacosRestClient.firstText(body, "tenant", "namespaceId", "namespace")
                        : blankToEmpty(namespaceId),
                content,
                NacosRestClient.firstText(body, "type", "configType"),
                NacosRestClient.firstText(body, "md5", "contentMd5"),
                NacosRestClient.firstText(body, "appName", "app")
        );
    }

    public static NacosConfigContentDto publishConfig(
            ConnectionEntity entity,
            String dataId,
            String group,
            String namespaceId,
            String content,
            String type
    ) throws Exception {
        if (dataId == null || dataId.isBlank()) {
            throw new IllegalArgumentException("dataId is required");
        }
        if (content == null) {
            throw new IllegalArgumentException("content is required");
        }
        String resolvedGroup = group != null && !group.isBlank() ? group.trim() : "DEFAULT_GROUP";
        String tenant = blankToEmpty(namespaceId);
        NacosRestClient client = new NacosRestClient(NacosConnectionConfig.from(entity));
        client.publishConfig(dataId.trim(), resolvedGroup, tenant, content, type);
        return getConfig(entity, dataId.trim(), resolvedGroup, tenant);
    }

    public static NacosServicesResultDto listServices(ConnectionEntity entity, String namespaceId, int limit)
            throws Exception {
        NacosRestClient client = new NacosRestClient(NacosConnectionConfig.from(entity));
        int pageSize = Math.max(1, limit);
        JsonNode root = client.listServices(blankToEmpty(namespaceId), pageSize);
        JsonNode body = NacosRestClient.unwrapDataObject(root);
        List<NacosServiceDto> services = new ArrayList<>();
        for (JsonNode item : serviceListItems(body)) {
            if (item == null || item.isNull() || item.isMissingNode()) {
                continue;
            }
            if (item.isTextual()) {
                String raw = item.asText(null);
                if (raw == null || raw.isBlank()) {
                    continue;
                }
                String name = raw.trim();
                String groupName = "DEFAULT_GROUP";
                if (name.contains("@@")) {
                    int sep = name.indexOf("@@");
                    groupName = name.substring(0, sep);
                    name = name.substring(sep + 2);
                }
                if (name.isBlank()) {
                    continue;
                }
                services.add(new NacosServiceDto(name, groupName, null));
                continue;
            }
            String name = NacosRestClient.firstText(item, "name", "serviceName", "dom");
            if (name == null || name.isBlank()) {
                continue;
            }
            String groupName = NacosRestClient.firstText(item, "groupName", "group");
            if (name.contains("@@")) {
                int sep = name.indexOf("@@");
                if (groupName == null || groupName.isBlank()) {
                    groupName = name.substring(0, sep);
                }
                name = name.substring(sep + 2);
            }
            if (name.isBlank()) {
                continue;
            }
            if (groupName == null || groupName.isBlank()) {
                groupName = "DEFAULT_GROUP";
            }
            String clusterCount = NacosRestClient.firstText(item, "clusterCount");
            if (clusterCount == null && item.has("clusterCount") && item.path("clusterCount").isNumber()) {
                clusterCount = String.valueOf(item.path("clusterCount").asInt());
            }
            services.add(new NacosServiceDto(name, groupName, clusterCount));
        }
        int total = body.has("count")
                ? NacosRestClient.intValue(body, "count")
                : (body.has("totalCount")
                    ? NacosRestClient.intValue(body, "totalCount")
                    : (root.has("count") ? NacosRestClient.intValue(root, "count") : services.size()));
        return new NacosServicesResultDto(List.copyOf(services), total);
    }

    public static NacosInstancesResultDto listInstances(
            ConnectionEntity entity,
            String serviceName,
            String groupName,
            String namespaceId
    ) throws Exception {
        if (serviceName == null || serviceName.isBlank()) {
            throw new IllegalArgumentException("serviceName is required");
        }
        NacosRestClient client = new NacosRestClient(NacosConnectionConfig.from(entity));
        JsonNode root = client.listInstances(
                serviceName.trim(),
                groupName,
                blankToEmpty(namespaceId)
        );
        JsonNode body = NacosRestClient.unwrapDataObject(root);
        List<NacosInstanceDto> instances = new ArrayList<>();
        List<JsonNode> hosts = NacosRestClient.array(body, "hosts");
        if (hosts.isEmpty()) {
            hosts = NacosRestClient.array(root, "hosts");
        }
        for (JsonNode item : hosts) {
            String ip = NacosRestClient.firstText(item, "ip", "host");
            if (ip == null || ip.isBlank()) {
                continue;
            }
            instances.add(new NacosInstanceDto(
                    ip,
                    NacosRestClient.intValue(item, "port"),
                    item.has("healthy") ? NacosRestClient.bool(item, "healthy") : true,
                    NacosRestClient.doubleValue(item, "weight"),
                    NacosRestClient.firstText(item, "clusterName", "cluster"),
                    NacosRestClient.firstText(item, "serviceName", "service"),
                    item.has("enabled") ? NacosRestClient.bool(item, "enabled") : true,
                    NacosRestClient.metadataText(item)
            ));
        }
        int total = body.has("count")
                ? NacosRestClient.intValue(body, "count")
                : (body.has("totalCount")
                    ? NacosRestClient.intValue(body, "totalCount")
                    : instances.size());
        return new NacosInstancesResultDto(List.copyOf(instances), total);
    }

    private static List<JsonNode> serviceListItems(JsonNode root) {
        if (root == null || root.isMissingNode() || root.isNull()) {
            return List.of();
        }
        for (String field : List.of("serviceList", "doms", "pageItems")) {
            JsonNode node = root.path(field);
            if (node.isArray()) {
                List<JsonNode> items = new ArrayList<>();
                for (JsonNode item : node) {
                    items.add(item);
                }
                return items;
            }
        }
        return List.of();
    }

    private static String blankToEmpty(String value) {
        return value == null || value.isBlank() ? "" : value.trim();
    }
}
