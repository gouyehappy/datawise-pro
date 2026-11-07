package org.apache.datawise.backend.polaris;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.datawise.backend.domain.PolarisConfigContentDto;
import org.apache.datawise.backend.domain.PolarisConfigDto;
import org.apache.datawise.backend.domain.PolarisConfigGroupDto;
import org.apache.datawise.backend.domain.PolarisConfigGroupsResultDto;
import org.apache.datawise.backend.domain.PolarisConfigsResultDto;
import org.apache.datawise.backend.domain.PolarisInfoDto;
import org.apache.datawise.backend.domain.PolarisInstanceDto;
import org.apache.datawise.backend.domain.PolarisInstancesResultDto;
import org.apache.datawise.backend.domain.PolarisNamespaceDto;
import org.apache.datawise.backend.domain.PolarisNamespacesResultDto;
import org.apache.datawise.backend.domain.PolarisServiceDto;
import org.apache.datawise.backend.domain.PolarisServicesResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.ArrayList;
import java.util.List;

public final class PolarisConnectionSupport {

    private PolarisConnectionSupport() {
    }

    public static PolarisInfoDto info(ConnectionEntity entity) throws Exception {
        PolarisConnectionConfig config = PolarisConnectionConfig.from(entity);
        PolarisNamespacesResultDto namespaces = listNamespaces(entity);
        return new PolarisInfoDto(
                entity != null ? entity.getHost() : null,
                config.baseUrl(),
                namespaces.totalCount()
        );
    }

    public static PolarisNamespacesResultDto listNamespaces(ConnectionEntity entity) throws Exception {
        PolarisRestClient client = new PolarisRestClient(PolarisConnectionConfig.from(entity));
        JsonNode root = PolarisRestClient.unwrapData(client.listNamespaces());
        List<PolarisNamespaceDto> namespaces = new ArrayList<>();
        for (JsonNode item : PolarisRestClient.array(root, "namespaces", "data")) {
            String name = PolarisRestClient.firstText(item, "name", "namespace", "namespaceName");
            if (name == null || name.isBlank()) {
                continue;
            }
            namespaces.add(new PolarisNamespaceDto(
                    name,
                    PolarisRestClient.firstText(item, "comment", "desc"),
                    PolarisRestClient.firstText(item, "owners", "owner"),
                    PolarisRestClient.firstText(item, "ctime", "createTime"),
                    PolarisRestClient.firstText(item, "mtime", "modifyTime")
            ));
        }
        int total = root.has("amount")
                ? PolarisRestClient.intValue(root, "amount")
                : (root.has("totalCount") ? PolarisRestClient.intValue(root, "totalCount") : namespaces.size());
        return new PolarisNamespacesResultDto(List.copyOf(namespaces), total);
    }

    public static PolarisServicesResultDto listServices(ConnectionEntity entity, String namespace, int limit)
            throws Exception {
        PolarisRestClient client = new PolarisRestClient(PolarisConnectionConfig.from(entity));
        JsonNode root = PolarisRestClient.unwrapData(client.listServices(namespace, limit));
        List<PolarisServiceDto> services = new ArrayList<>();
        for (JsonNode item : PolarisRestClient.array(root, "services", "data")) {
            String name = PolarisRestClient.firstText(item, "name", "service", "serviceName");
            if (name == null || name.isBlank()) {
                continue;
            }
            services.add(new PolarisServiceDto(
                    name,
                    PolarisRestClient.firstText(item, "namespace", "namespaceName"),
                    PolarisRestClient.firstText(item, "owners", "owner"),
                    PolarisRestClient.firstText(item, "ports", "port"),
                    PolarisRestClient.firstText(item, "business"),
                    PolarisRestClient.firstText(item, "department"),
                    PolarisRestClient.firstText(item, "comment", "desc"),
                    PolarisRestClient.firstText(item, "revision")
            ));
        }
        int total = root.has("amount")
                ? PolarisRestClient.intValue(root, "amount")
                : (root.has("totalCount") ? PolarisRestClient.intValue(root, "totalCount") : services.size());
        return new PolarisServicesResultDto(List.copyOf(services), total);
    }

    public static PolarisInstancesResultDto listInstances(
            ConnectionEntity entity,
            String namespace,
            String service,
            int limit
    ) throws Exception {
        if (service == null || service.isBlank()) {
            throw new IllegalArgumentException("service is required");
        }
        PolarisRestClient client = new PolarisRestClient(PolarisConnectionConfig.from(entity));
        JsonNode root = PolarisRestClient.unwrapData(client.listInstances(namespace, service, limit));
        List<PolarisInstanceDto> instances = new ArrayList<>();
        for (JsonNode item : PolarisRestClient.array(root, "instances", "data")) {
            String host = PolarisRestClient.firstText(item, "host", "ip");
            if (host == null || host.isBlank()) {
                continue;
            }
            instances.add(new PolarisInstanceDto(
                    PolarisRestClient.firstText(item, "id", "instanceId"),
                    host,
                    PolarisRestClient.intValue(item, "port"),
                    PolarisRestClient.firstText(item, "protocol"),
                    PolarisRestClient.firstText(item, "version"),
                    PolarisRestClient.intValue(item, "weight"),
                    item.has("healthy") ? PolarisRestClient.bool(item, "healthy") : true,
                    PolarisRestClient.bool(item, "isolate"),
                    PolarisRestClient.firstText(item, "namespace", "namespaceName"),
                    PolarisRestClient.firstText(item, "service", "serviceName")
            ));
        }
        int total = root.has("amount")
                ? PolarisRestClient.intValue(root, "amount")
                : (root.has("totalCount") ? PolarisRestClient.intValue(root, "totalCount") : instances.size());
        return new PolarisInstancesResultDto(List.copyOf(instances), total);
    }

    public static PolarisConfigGroupsResultDto listConfigGroups(ConnectionEntity entity, String namespace, int limit)
            throws Exception {
        PolarisRestClient client = new PolarisRestClient(PolarisConnectionConfig.from(entity));
        JsonNode root = PolarisRestClient.unwrapData(client.listConfigGroups(namespace, limit));
        List<PolarisConfigGroupDto> groups = new ArrayList<>();
        for (JsonNode item : PolarisRestClient.array(root, "configFileGroups", "groups", "data")) {
            String name = PolarisRestClient.firstText(item, "name", "group", "groupName");
            if (name == null || name.isBlank()) {
                continue;
            }
            groups.add(new PolarisConfigGroupDto(
                    name,
                    PolarisRestClient.firstText(item, "namespace", "namespaceName"),
                    PolarisRestClient.firstText(item, "comment", "desc")
            ));
        }
        int total = root.has("amount")
                ? PolarisRestClient.intValue(root, "amount")
                : (root.has("totalCount") ? PolarisRestClient.intValue(root, "totalCount") : groups.size());
        return new PolarisConfigGroupsResultDto(List.copyOf(groups), total);
    }

    public static PolarisConfigsResultDto listConfigs(
            ConnectionEntity entity,
            String namespace,
            String group,
            String name,
            int limit
    ) throws Exception {
        PolarisRestClient client = new PolarisRestClient(PolarisConnectionConfig.from(entity));
        JsonNode root = PolarisRestClient.unwrapData(client.searchConfigFiles(namespace, group, name, limit));
        List<PolarisConfigDto> configs = new ArrayList<>();
        for (JsonNode item : PolarisRestClient.array(root, "configFiles", "configFileInfos", "data")) {
            String configName = PolarisRestClient.firstText(item, "name", "fileName", "configName");
            if (configName == null || configName.isBlank()) {
                continue;
            }
            configs.add(new PolarisConfigDto(
                    configName,
                    PolarisRestClient.firstText(item, "namespace", "namespaceName"),
                    PolarisRestClient.firstText(item, "group", "groupName"),
                    PolarisRestClient.firstText(item, "format", "fileFormat", "type"),
                    PolarisRestClient.firstText(item, "comment", "desc")
            ));
        }
        int total = root.has("amount")
                ? PolarisRestClient.intValue(root, "amount")
                : (root.has("totalCount") ? PolarisRestClient.intValue(root, "totalCount") : configs.size());
        return new PolarisConfigsResultDto(List.copyOf(configs), total);
    }

    public static PolarisConfigContentDto getConfig(
            ConnectionEntity entity,
            String namespace,
            String group,
            String name
    ) throws Exception {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("name is required");
        }
        PolarisRestClient client = new PolarisRestClient(PolarisConnectionConfig.from(entity));
        JsonNode root = PolarisRestClient.unwrapData(client.getConfigFile(namespace, group, name.trim()));
        JsonNode configFile = root != null && root.has("configFile") && root.path("configFile").isObject()
                ? root.path("configFile")
                : root;
        String content = PolarisRestClient.firstText(configFile, "content");
        if (content == null) {
            content = PolarisRestClient.firstText(root, "content");
        }
        return new PolarisConfigContentDto(
                PolarisRestClient.firstText(configFile, "name", "fileName", "configName") != null
                        ? PolarisRestClient.firstText(configFile, "name", "fileName", "configName")
                        : name.trim(),
                PolarisRestClient.firstText(configFile, "namespace", "namespaceName") != null
                        ? PolarisRestClient.firstText(configFile, "namespace", "namespaceName")
                        : namespace,
                PolarisRestClient.firstText(configFile, "group", "groupName") != null
                        ? PolarisRestClient.firstText(configFile, "group", "groupName")
                        : group,
                content,
                PolarisRestClient.firstText(configFile, "format", "fileFormat", "type"),
                PolarisRestClient.firstText(configFile, "md5", "contentMd5")
        );
    }

    public static PolarisConfigContentDto updateConfig(
            ConnectionEntity entity,
            String namespace,
            String group,
            String name,
            String content,
            String format
    ) throws Exception {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("name is required");
        }
        if (content == null) {
            throw new IllegalArgumentException("content is required");
        }
        String resolvedName = name.trim();
        String resolvedNamespace = namespace != null ? namespace.trim() : "";
        String resolvedGroup = group != null ? group.trim() : "";
        PolarisRestClient client = new PolarisRestClient(PolarisConnectionConfig.from(entity));
        client.updateConfigFile(resolvedNamespace, resolvedGroup, resolvedName, content, format);
        try {
            client.releaseConfigFile(resolvedNamespace, resolvedGroup, resolvedName);
        } catch (Exception releaseError) {
            // Some deployments apply content on PUT without a separate release step.
            String msg = releaseError.getMessage() != null ? releaseError.getMessage().toLowerCase() : "";
            if (!(msg.contains("404") || msg.contains("not found") || msg.contains("unsupported"))) {
                throw releaseError;
            }
        }
        return getConfig(entity, resolvedNamespace, resolvedGroup, resolvedName);
    }
}
