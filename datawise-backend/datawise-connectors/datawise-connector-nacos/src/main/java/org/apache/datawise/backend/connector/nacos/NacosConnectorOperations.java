package org.apache.datawise.backend.connector.nacos;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.connector.nacos.support.NacosConnectionErrors;
import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.connector.operation.ConnectorNacosOperations;
import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.domain.NacosConfigContentDto;
import org.apache.datawise.backend.domain.NacosConfigsResultDto;
import org.apache.datawise.backend.domain.NacosInfoDto;
import org.apache.datawise.backend.domain.NacosInstancesResultDto;
import org.apache.datawise.backend.domain.NacosNamespacesResultDto;
import org.apache.datawise.backend.domain.NacosServicesResultDto;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.nacos.NacosConnectionSupport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.concurrent.Callable;

public class NacosConnectorOperations
        implements ConnectorConnectionOperations, ConnectorCatalogOperations, ConnectorNacosOperations {

    private static final Logger log = LoggerFactory.getLogger(NacosConnectorOperations.class);

    @Override
    public ConnectionTestResult test(ConnectionEntity entity) {
        long start = System.currentTimeMillis();
        try {
            NacosInfoDto info = NacosConnectionSupport.info(entity);
            long latency = System.currentTimeMillis() - start;
            String message = String.format(
                    "Connected to Nacos %s (%d namespaces) in %dms",
                    entity.getHost(),
                    info.namespaceCount(),
                    latency
            );
            return new ConnectionTestResult(true, message, latency);
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "Nacos connection test failed for " + entity.getHost(), ex);
            long latency = System.currentTimeMillis() - start;
            return new ConnectionTestResult(false, NacosConnectionErrors.toUserMessage(entity, ex), latency);
        }
    }

    @Override
    public List<TreeNode> loadConnectionRoot(ConnectionEntity connection, String pattern) {
        return List.of();
    }

    @Override
    public NacosInfoDto info(ConnectionEntity connection) {
        return wrap(connection, () -> NacosConnectionSupport.info(connection));
    }

    @Override
    public NacosNamespacesResultDto listNamespaces(ConnectionEntity connection) {
        return wrap(connection, () -> NacosConnectionSupport.listNamespaces(connection));
    }

    @Override
    public NacosConfigsResultDto listConfigs(
            ConnectionEntity connection,
            String namespaceId,
            String dataId,
            String group,
            int limit
    ) {
        return wrap(connection, () -> NacosConnectionSupport.listConfigs(connection, namespaceId, dataId, group, limit));
    }

    @Override
    public NacosConfigContentDto getConfig(
            ConnectionEntity connection,
            String dataId,
            String group,
            String namespaceId
    ) {
        return wrap(connection, () -> NacosConnectionSupport.getConfig(connection, dataId, group, namespaceId));
    }

    @Override
    public NacosConfigContentDto publishConfig(
            ConnectionEntity connection,
            String dataId,
            String group,
            String namespaceId,
            String content,
            String type
    ) {
        return wrap(connection, () -> NacosConnectionSupport.publishConfig(
                connection, dataId, group, namespaceId, content, type
        ));
    }

    @Override
    public NacosServicesResultDto listServices(ConnectionEntity connection, String namespaceId, int limit) {
        return wrap(connection, () -> NacosConnectionSupport.listServices(connection, namespaceId, limit));
    }

    @Override
    public NacosInstancesResultDto listInstances(
            ConnectionEntity connection,
            String serviceName,
            String groupName,
            String namespaceId
    ) {
        return wrap(connection, () -> NacosConnectionSupport.listInstances(connection, serviceName, groupName, namespaceId));
    }

    private static <T> T wrap(ConnectionEntity connection, Callable<T> callable) {
        try {
            return callable.call();
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            String message = NacosConnectionErrors.toUserMessage(connection, ex);
            if (isClientFacing(ex)) {
                throw new IllegalArgumentException(message, ex);
            }
            throw new IllegalStateException(message, ex);
        }
    }

    private static boolean isClientFacing(Throwable error) {
        String root = error == null || error.getMessage() == null ? "" : error.getMessage().toLowerCase();
        return root.contains("401")
                || root.contains("403")
                || root.contains("404")
                || root.contains("400")
                || root.contains("required string parameter")
                || root.contains("forbidden")
                || root.contains("unauthorized");
    }
}
