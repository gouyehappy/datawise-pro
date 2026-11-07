package org.apache.datawise.backend.connector.facade.polaris;

import org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess;
import org.apache.datawise.backend.domain.PolarisConfigContentDto;
import org.apache.datawise.backend.domain.PolarisConfigGroupsResultDto;
import org.apache.datawise.backend.domain.PolarisConfigsResultDto;
import org.apache.datawise.backend.domain.PolarisInfoDto;
import org.apache.datawise.backend.domain.PolarisInstancesResultDto;
import org.apache.datawise.backend.domain.PolarisNamespacesResultDto;
import org.apache.datawise.backend.domain.PolarisServicesResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Component;

/** Polaris naming and config-center capability entry. */
@Component
public class ConnectorPolarisAccess {

    private final ConnectorCatalogAccess catalog;

    public ConnectorPolarisAccess(ConnectorCatalogAccess catalog) {
        this.catalog = catalog;
    }

    public PolarisInfoDto info(ConnectionEntity connection) {
        return catalog.resolve(connection).polaris().info(connection);
    }

    public PolarisNamespacesResultDto listNamespaces(ConnectionEntity connection) {
        return catalog.resolve(connection).polaris().listNamespaces(connection);
    }

    public PolarisServicesResultDto listServices(ConnectionEntity connection, String namespace, int limit) {
        return catalog.resolve(connection).polaris().listServices(connection, namespace, limit);
    }

    public PolarisInstancesResultDto listInstances(
                                                   ConnectionEntity connection,
                                                   String namespace,
                                                   String service,
                                                   int limit) {
        return catalog.resolve(connection).polaris().listInstances(connection, namespace, service, limit);
    }

    public PolarisConfigGroupsResultDto listConfigGroups(ConnectionEntity connection, String namespace, int limit) {
        return catalog.resolve(connection).polaris().listConfigGroups(connection, namespace, limit);
    }

    public PolarisConfigsResultDto listConfigs(
                                               ConnectionEntity connection,
                                               String namespace,
                                               String group,
                                               String name,
                                               int limit) {
        return catalog.resolve(connection).polaris().listConfigs(connection, namespace, group, name, limit);
    }

    public PolarisConfigContentDto getConfig(
                                             ConnectionEntity connection,
                                             String namespace,
                                             String group,
                                             String name) {
        return catalog.resolve(connection).polaris().getConfig(connection, namespace, group, name);
    }

    public PolarisConfigContentDto updateConfig(
                                                ConnectionEntity connection,
                                                String namespace,
                                                String group,
                                                String name,
                                                String content,
                                                String format) {
        return catalog.resolve(connection).polaris().updateConfig(
                connection, namespace, group, name, content, format);
    }
}
