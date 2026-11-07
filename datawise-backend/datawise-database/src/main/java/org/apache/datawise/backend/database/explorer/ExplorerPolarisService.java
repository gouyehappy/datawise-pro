package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.domain.PolarisConfigContentDto;
import org.apache.datawise.backend.domain.PolarisConfigGroupsResultDto;
import org.apache.datawise.backend.domain.PolarisConfigsResultDto;
import org.apache.datawise.backend.domain.PolarisInfoDto;
import org.apache.datawise.backend.domain.PolarisInstancesResultDto;
import org.apache.datawise.backend.domain.PolarisNamespacesResultDto;
import org.apache.datawise.backend.domain.PolarisServicesResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Service;

@Service
public class ExplorerPolarisService {

    private final ConnectionExecutionContext connectionContext;
    private final ConnectorFacade connectorFacade;

    public ExplorerPolarisService(
            ConnectionExecutionContext connectionContext,
            ConnectorFacade connectorFacade
    ) {
        this.connectionContext = connectionContext;
        this.connectorFacade = connectorFacade;
    }

    public PolarisInfoDto info(String connectionId) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.polaris().info(connection);
    }

    public PolarisNamespacesResultDto listNamespaces(String connectionId) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.polaris().listNamespaces(connection);
    }

    public PolarisServicesResultDto listServices(String connectionId, String namespace, Integer limit) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int pageSize = limit == null || limit <= 0 ? 100 : Math.min(limit, 500);
        return connectorFacade.polaris().listServices(connection, namespace, pageSize);
    }

    public PolarisInstancesResultDto listInstances(
            String connectionId,
            String namespace,
            String service,
            Integer limit
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        if (service == null || service.isBlank()) {
            throw new IllegalArgumentException("service is required");
        }
        int pageSize = limit == null || limit <= 0 ? 100 : Math.min(limit, 500);
        return connectorFacade.polaris().listInstances(connection, namespace, service.trim(), pageSize);
    }

    public PolarisConfigGroupsResultDto listConfigGroups(String connectionId, String namespace, Integer limit) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int pageSize = limit == null || limit <= 0 ? 100 : Math.min(limit, 500);
        return connectorFacade.polaris().listConfigGroups(connection, namespace, pageSize);
    }

    public PolarisConfigsResultDto listConfigs(
            String connectionId,
            String namespace,
            String group,
            String name,
            Integer limit
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int pageSize = limit == null || limit <= 0 ? 100 : Math.min(limit, 500);
        return connectorFacade.polaris().listConfigs(connection, namespace, group, name, pageSize);
    }

    public PolarisConfigContentDto getConfig(
            String connectionId,
            String namespace,
            String group,
            String name
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("name is required");
        }
        return connectorFacade.polaris().getConfig(connection, namespace, group, name.trim());
    }

    public PolarisConfigContentDto updateConfig(
            String connectionId,
            String namespace,
            String group,
            String name,
            String content,
            String format
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("name is required");
        }
        if (content == null) {
            throw new IllegalArgumentException("content is required");
        }
        return connectorFacade.polaris().updateConfig(
                connection, namespace, group, name.trim(), content, format
        );
    }

    private ConnectionEntity requireAvailableExplorerConnection(String connectionId) {
        return connectionContext.requireAvailableConnectionForCurrentUser(
                connectionId,
                ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND
        ).entity();
    }
}
