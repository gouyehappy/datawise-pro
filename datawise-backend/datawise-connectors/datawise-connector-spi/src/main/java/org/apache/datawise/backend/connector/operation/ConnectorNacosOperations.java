package org.apache.datawise.backend.connector.operation;

import org.apache.datawise.backend.domain.NacosConfigContentDto;
import org.apache.datawise.backend.domain.NacosConfigsResultDto;
import org.apache.datawise.backend.domain.NacosInfoDto;
import org.apache.datawise.backend.domain.NacosInstancesResultDto;
import org.apache.datawise.backend.domain.NacosNamespacesResultDto;
import org.apache.datawise.backend.domain.NacosServicesResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;

/** Nacos config-center and naming browse operations. */
public interface ConnectorNacosOperations {

    NacosInfoDto info(ConnectionEntity connection);

    NacosNamespacesResultDto listNamespaces(ConnectionEntity connection);

    NacosConfigsResultDto listConfigs(
                                      ConnectionEntity connection,
                                      String namespaceId,
                                      String dataId,
                                      String group,
                                      int limit);

    NacosConfigContentDto getConfig(
                                    ConnectionEntity connection,
                                    String dataId,
                                    String group,
                                    String namespaceId);

    NacosConfigContentDto publishConfig(
                                        ConnectionEntity connection,
                                        String dataId,
                                        String group,
                                        String namespaceId,
                                        String content,
                                        String type);

    NacosServicesResultDto listServices(ConnectionEntity connection, String namespaceId, int limit);

    NacosInstancesResultDto listInstances(
                                          ConnectionEntity connection,
                                          String serviceName,
                                          String groupName,
                                          String namespaceId);
}
