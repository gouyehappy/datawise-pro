package org.apache.datawise.backend.connector.redis.support;

import org.apache.datawise.backend.domain.RedisCommandResultDto;
import org.apache.datawise.backend.domain.RedisKeyDetailDto;
import org.apache.datawise.backend.domain.RedisKeysScanResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.redis.RedisClientFactory;
import org.apache.datawise.backend.redis.RedisCommandExecutor;
import org.apache.datawise.backend.redis.RedisKeyScanner;

import java.util.List;

public final class RedisConnectionSupport {

    private RedisConnectionSupport() {
    }

    public static void ping(ConnectionEntity entity) {
        RedisClientFactory.withSession(entity, session -> {
            String pong = session.sync().ping();
            if (pong == null || !"PONG".equalsIgnoreCase(pong)) {
                throw new IllegalStateException("Redis ping failed");
            }
            return null;
        });
    }

    public static List<String> scanKeys(ConnectionEntity entity, String pattern, int limit) {
        return RedisKeyScanner.scanKeys(entity, pattern, limit);
    }

    public static RedisKeysScanResultDto scanKeysPage(
            ConnectionEntity entity,
            String pattern,
            String cursor,
            int count
    ) {
        return RedisKeyScanner.scanKeysPage(entity, pattern, cursor, count);
    }

    public static String keyType(ConnectionEntity entity, String key) {
        return RedisKeyScanner.keyType(entity, key);
    }

    public static Long keyTtl(ConnectionEntity entity, String key) {
        return RedisKeyScanner.keyTtl(entity, key);
    }

    public static String keyValuePreview(ConnectionEntity entity, String key, int maxLen) {
        return RedisKeyScanner.keyValuePreview(entity, key, maxLen);
    }

    public static RedisCommandResultDto executeCommand(ConnectionEntity entity, String commandLine) {
        return RedisCommandExecutor.execute(entity, commandLine);
    }

    static List<String> parseCommandLine(String line) {
        return RedisCommandExecutor.parseCommandLine(line);
    }

    static String formatCommandResult(Object value) {
        return RedisCommandExecutor.formatCommandResult(value);
    }

    public static RedisKeyDetailDto fetchKeyDetail(ConnectionEntity entity, String key, int maxPreview) {
        return RedisKeyScanner.fetchKeyDetail(entity, key, maxPreview);
    }
}
