package org.apache.datawise.backend.connector.operation;

import org.apache.datawise.backend.domain.PolarisConfigContentDto;
import org.apache.datawise.backend.domain.PolarisConfigGroupsResultDto;
import org.apache.datawise.backend.domain.PolarisConfigsResultDto;
import org.apache.datawise.backend.domain.PolarisInfoDto;
import org.apache.datawise.backend.domain.PolarisInstancesResultDto;
import org.apache.datawise.backend.domain.PolarisNamespacesResultDto;
import org.apache.datawise.backend.domain.PolarisServicesResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;

/** Polaris naming / config-center browse operations. */
public interface ConnectorPolarisOperations {

    PolarisInfoDto info(ConnectionEntity connection);

    PolarisNamespacesResultDto listNamespaces(ConnectionEntity connection);

    PolarisServicesResultDto listServices(ConnectionEntity connection, String namespace, int limit);

    PolarisInstancesResultDto listInstances(
                                            ConnectionEntity connection,
                                            String namespace,
                                            String service,
                                            int limit);

    PolarisConfigGroupsResultDto listConfigGroups(ConnectionEntity connection, String namespace, int limit);

    PolarisConfigsResultDto listConfigs(
                                        ConnectionEntity connection,
                                        String namespace,
                                        String group,
                                        String name,
                                        int limit);

    PolarisConfigContentDto getConfig(
                                      ConnectionEntity connection,
                                      String namespace,
                                      String group,
                                      String name);

    PolarisConfigContentDto updateConfig(
                                         ConnectionEntity connection,
                                         String namespace,
                                         String group,
                                         String name,
                                         String content,
                                         String format);
}
