package org.apache.datawise.backend.connector.facade.nacos;

import org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess;
import org.apache.datawise.backend.domain.NacosConfigContentDto;
import org.apache.datawise.backend.domain.NacosConfigsResultDto;
import org.apache.datawise.backend.domain.NacosInfoDto;
import org.apache.datawise.backend.domain.NacosInstancesResultDto;
import org.apache.datawise.backend.domain.NacosNamespacesResultDto;
import org.apache.datawise.backend.domain.NacosServicesResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Component;

/** Nacos config-center and naming capability entry. */
@Component
public class ConnectorNacosAccess {

    private final ConnectorCatalogAccess catalog;

    public ConnectorNacosAccess(ConnectorCatalogAccess catalog) {
        this.catalog = catalog;
    }

    public NacosInfoDto info(ConnectionEntity connection) {
        return catalog.resolve(connection).nacos().info(connection);
    }

    public NacosNamespacesResultDto listNamespaces(ConnectionEntity connection) {
        return catalog.resolve(connection).nacos().listNamespaces(connection);
    }

    public NacosConfigsResultDto listConfigs(
                                             ConnectionEntity connection,
                                             String namespaceId,
                                             String dataId,
                                             String group,
                                             int limit) {
        return catalog.resolve(connection).nacos().listConfigs(connection, namespaceId, dataId, group, limit);
    }

    public NacosConfigContentDto getConfig(
                                           ConnectionEntity connection,
                                           String dataId,
                                           String group,
                                           String namespaceId) {
        return catalog.resolve(connection).nacos().getConfig(connection, dataId, group, namespaceId);
    }

    public NacosConfigContentDto publishConfig(
                                               ConnectionEntity connection,
                                               String dataId,
                                               String group,
                                               String namespaceId,
                                               String content,
                                               String type) {
        return catalog.resolve(connection).nacos().publishConfig(
                connection, dataId, group, namespaceId, content, type);
    }

    public NacosServicesResultDto listServices(ConnectionEntity connection, String namespaceId, int limit) {
        return catalog.resolve(connection).nacos().listServices(connection, namespaceId, limit);
    }

    public NacosInstancesResultDto listInstances(
                                                 ConnectionEntity connection,
                                                 String serviceName,
                                                 String groupName,
                                                 String namespaceId) {
        return catalog.resolve(connection).nacos().listInstances(connection, serviceName, groupName, namespaceId);
    }
}
