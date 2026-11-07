package org.apache.datawise.backend.connector.polaris;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.connector.operation.ConnectorPolarisOperations;
import org.apache.datawise.backend.connector.polaris.support.PolarisConnectionErrors;
import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.domain.PolarisConfigContentDto;
import org.apache.datawise.backend.domain.PolarisConfigGroupsResultDto;
import org.apache.datawise.backend.domain.PolarisConfigsResultDto;
import org.apache.datawise.backend.domain.PolarisInfoDto;
import org.apache.datawise.backend.domain.PolarisInstancesResultDto;
import org.apache.datawise.backend.domain.PolarisNamespacesResultDto;
import org.apache.datawise.backend.domain.PolarisServicesResultDto;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.polaris.PolarisConnectionSupport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

public class PolarisConnectorOperations
        implements ConnectorConnectionOperations, ConnectorCatalogOperations, ConnectorPolarisOperations {

    private static final Logger log = LoggerFactory.getLogger(PolarisConnectorOperations.class);

    @Override
    public ConnectionTestResult test(ConnectionEntity entity) {
        long start = System.currentTimeMillis();
        try {
            PolarisInfoDto info = PolarisConnectionSupport.info(entity);
            long latency = System.currentTimeMillis() - start;
            String message = String.format(
                    "Connected to Polaris %s (%d namespaces) in %dms",
                    entity.getHost(),
                    info.namespaceCount(),
                    latency
            );
            return new ConnectionTestResult(true, message, latency);
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "Polaris connection test failed for " + entity.getHost(), ex);
            long latency = System.currentTimeMillis() - start;
            return new ConnectionTestResult(false, PolarisConnectionErrors.toUserMessage(entity, ex), latency);
        }
    }

    @Override
    public List<TreeNode> loadConnectionRoot(ConnectionEntity connection, String pattern) {
        return List.of();
    }

    @Override
    public PolarisInfoDto info(ConnectionEntity connection) {
        return wrap(() -> PolarisConnectionSupport.info(connection));
    }

    @Override
    public PolarisNamespacesResultDto listNamespaces(ConnectionEntity connection) {
        return wrap(() -> PolarisConnectionSupport.listNamespaces(connection));
    }

    @Override
    public PolarisServicesResultDto listServices(ConnectionEntity connection, String namespace, int limit) {
        return wrap(() -> PolarisConnectionSupport.listServices(connection, namespace, limit));
    }

    @Override
    public PolarisInstancesResultDto listInstances(
            ConnectionEntity connection,
            String namespace,
            String service,
            int limit
    ) {
        return wrap(() -> PolarisConnectionSupport.listInstances(connection, namespace, service, limit));
    }

    @Override
    public PolarisConfigGroupsResultDto listConfigGroups(ConnectionEntity connection, String namespace, int limit) {
        return wrap(() -> PolarisConnectionSupport.listConfigGroups(connection, namespace, limit));
    }

    @Override
    public PolarisConfigsResultDto listConfigs(
            ConnectionEntity connection,
            String namespace,
            String group,
            String name,
            int limit
    ) {
        return wrap(() -> PolarisConnectionSupport.listConfigs(connection, namespace, group, name, limit));
    }

    @Override
    public PolarisConfigContentDto getConfig(
            ConnectionEntity connection,
            String namespace,
            String group,
            String name
    ) {
        return wrap(() -> PolarisConnectionSupport.getConfig(connection, namespace, group, name));
    }

    @Override
    public PolarisConfigContentDto updateConfig(
            ConnectionEntity connection,
            String namespace,
            String group,
            String name,
            String content,
            String format
    ) {
        return wrap(() -> PolarisConnectionSupport.updateConfig(
                connection, namespace, group, name, content, format
        ));
    }

    private static <T> T wrap(PolarisCallable<T> callable) {
        try {
            return callable.call();
        } catch (Exception ex) {
            throw new IllegalStateException(ex.getMessage(), ex);
        }
    }

    @FunctionalInterface
    private interface PolarisCallable<T> {
        T call() throws Exception;
    }
}
