package org.apache.datawise.backend.connector.redis;

import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.connector.operation.ConnectorKeyValueOperations;
import org.apache.datawise.backend.connector.operation.ConnectorNativeCommandOperations;
import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.domain.RedisCommandResultDto;
import org.apache.datawise.backend.domain.RedisKeyDetailDto;
import org.apache.datawise.backend.domain.RedisKeysScanResultDto;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.connector.redis.support.RedisConnectionErrors;
import org.apache.datawise.backend.connector.redis.support.RedisConnectionSupport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

public class RedisConnectorOperations
        implements ConnectorConnectionOperations, ConnectorCatalogOperations,
        ConnectorNativeCommandOperations, ConnectorKeyValueOperations {

    private static final Logger log = LoggerFactory.getLogger(RedisConnectorOperations.class);

    @Override
    public ConnectionTestResult test(ConnectionEntity entity) {
        long start = System.currentTimeMillis();
        try {
            RedisConnectionSupport.ping(entity);
            long latency = System.currentTimeMillis() - start;
            return new ConnectionTestResult(
                    true,
                    String.format("Connected to Redis %s:%s in %dms", entity.getHost(), entity.getPort(), latency),
                    latency
            );
        } catch (Exception ex) {
            ExceptionLogging.warn(
                    log,
                    "Redis connection test failed for " + entity.getHost() + ":" + entity.getPort(),
                    ex
            );
            long latency = System.currentTimeMillis() - start;
            return new ConnectionTestResult(
                    false,
                    RedisConnectionErrors.toUserMessage(entity, ex),
                    latency
            );
        }
    }

    @Override
    public List<TreeNode> loadConnectionRoot(ConnectionEntity connection, String pattern) {
        return List.of();
    }

    @Override
    public RedisCommandResultDto executeCommand(ConnectionEntity connection, String commandLine) {
        if (commandLine == null || commandLine.isBlank()) {
            throw new IllegalArgumentException("Redis command is required");
        }
        return RedisConnectionSupport.executeCommand(connection, commandLine);
    }

    @Override
    public RedisKeyDetailDto fetchKeyDetail(ConnectionEntity connection, String key) {
        if (key == null || key.isBlank()) {
            throw new IllegalArgumentException("Redis key is required");
        }
        return RedisConnectionSupport.fetchKeyDetail(connection, key, 4096);
    }

    @Override
    public RedisKeysScanResultDto scanKeys(
            ConnectionEntity connection,
            String pattern,
            String cursor,
            int count
    ) {
        return RedisConnectionSupport.scanKeysPage(connection, pattern, cursor, count);
    }
}
