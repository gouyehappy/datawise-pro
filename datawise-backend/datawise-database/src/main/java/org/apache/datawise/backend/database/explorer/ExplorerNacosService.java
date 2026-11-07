package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.common.support.ConnectionProbeTargetPolicy;
import org.apache.datawise.backend.config.ConnectionProbeProperties;
import org.apache.datawise.backend.connector.api.support.ConnectionMapper;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.domain.ConnectionConfig;
import org.apache.datawise.backend.domain.NacosConfigContentDto;
import org.apache.datawise.backend.domain.NacosConfigsResultDto;
import org.apache.datawise.backend.domain.NacosInfoDto;
import org.apache.datawise.backend.domain.NacosInstancesResultDto;
import org.apache.datawise.backend.domain.NacosNamespacesResultDto;
import org.apache.datawise.backend.domain.NacosServicesResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Service;

@Service
public class ExplorerNacosService {

    private final ConnectionExecutionContext connectionContext;
    private final ConnectorFacade connectorFacade;
    private final ConnectionProbeProperties probeProperties;

    public ExplorerNacosService(
            ConnectionExecutionContext connectionContext,
            ConnectorFacade connectorFacade,
            ConnectionProbeProperties probeProperties
    ) {
        this.connectionContext = connectionContext;
        this.connectorFacade = connectorFacade;
        this.probeProperties = probeProperties;
    }

    public NacosInfoDto info(String connectionId) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.nacos().info(connection);
    }

    public NacosNamespacesResultDto listNamespaces(String connectionId) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.nacos().listNamespaces(connection);
    }

    /** List namespaces for an unsaved connection form, using the same login as a saved connection. */
    public NacosNamespacesResultDto detectNamespaces(ConnectionConfig config) {
        if (config == null || config.getHost() == null || config.getHost().isBlank()) {
            throw new IllegalArgumentException("Host is required");
        }
        ConnectionProbeTargetPolicy.requireAllowedProbeHost(
                config.getHost(),
                "Host",
                probeProperties.isAllowPrivateNetworks()
        );
        if (config.getDbType() == null || config.getDbType().isBlank()) {
            config.setDbType("nacos");
        }
        ConnectionEntity probe = ConnectionMapper.fromDto(config, null, null, "probe");
        return connectorFacade.nacos().listNamespaces(probe);
    }

    public NacosConfigsResultDto listConfigs(
            String connectionId,
            String namespaceId,
            String dataId,
            String group,
            Integer limit
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int pageSize = limit == null || limit <= 0 ? 100 : Math.min(limit, 500);
        return connectorFacade.nacos().listConfigs(connection, namespaceId, dataId, group, pageSize);
    }

    public NacosConfigContentDto getConfig(
            String connectionId,
            String dataId,
            String group,
            String namespaceId
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        if (dataId == null || dataId.isBlank()) {
            throw new IllegalArgumentException("dataId is required");
        }
        return connectorFacade.nacos().getConfig(connection, dataId.trim(), group, namespaceId);
    }

    public NacosConfigContentDto publishConfig(
            String connectionId,
            String dataId,
            String group,
            String namespaceId,
            String content,
            String type
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        if (dataId == null || dataId.isBlank()) {
            throw new IllegalArgumentException("dataId is required");
        }
        if (content == null) {
            throw new IllegalArgumentException("content is required");
        }
        return connectorFacade.nacos().publishConfig(
                connection, dataId.trim(), group, namespaceId, content, type
        );
    }

    public NacosServicesResultDto listServices(String connectionId, String namespaceId, Integer limit) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int pageSize = limit == null || limit <= 0 ? 100 : Math.min(limit, 500);
        return connectorFacade.nacos().listServices(connection, namespaceId, pageSize);
    }

    public NacosInstancesResultDto listInstances(
            String connectionId,
            String serviceName,
            String groupName,
            String namespaceId
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        if (serviceName == null || serviceName.isBlank()) {
            throw new IllegalArgumentException("serviceName is required");
        }
        return connectorFacade.nacos().listInstances(connection, serviceName.trim(), groupName, namespaceId);
    }

    private ConnectionEntity requireAvailableExplorerConnection(String connectionId) {
        return connectionContext.requireAvailableConnectionForCurrentUser(
                connectionId,
                ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND
        ).entity();
    }
}
