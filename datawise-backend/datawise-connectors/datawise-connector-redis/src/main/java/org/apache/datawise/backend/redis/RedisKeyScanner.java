package org.apache.datawise.backend.redis;

import io.lettuce.core.ScanCursor;
import io.lettuce.core.api.sync.RedisCommands;
import org.apache.datawise.backend.domain.RedisKeyDetailDto;
import org.apache.datawise.backend.domain.RedisKeysScanResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.ArrayList;
import java.util.List;

/** SCAN and key metadata/preview for Redis explorer. */
public final class RedisKeyScanner {

    private RedisKeyScanner() {
    }

    public static List<String> scanKeys(ConnectionEntity entity, String pattern, int limit) {
        RedisKeysScanResultDto page = scanKeysPage(entity, pattern, null, limit);
        return new ArrayList<>(page.keys());
    }

    public static RedisKeysScanResultDto scanKeysPage(
            ConnectionEntity entity,
            String pattern,
            String cursor,
            int count
    ) {
        String scanPattern = pattern == null || pattern.isBlank() ? "*" : pattern.trim();
        int limit = Math.max(1, Math.min(count, 500));
        try (RedisClientFactory.RedisSession session = RedisClientFactory.open(entity)) {
            RedisCommands<String, String> commands = session.sync();
            ScanCursor scanCursor = toScanCursor(cursor);
            var scanResult = commands.scan(
                    scanCursor,
                    io.lettuce.core.ScanArgs.Builder.matches(scanPattern).limit(limit)
            );
            long dbSize = commands.dbsize();
            return new RedisKeysScanResultDto(
                    new ArrayList<>(scanResult.getKeys()),
                    scanResult.getCursor(),
                    !scanResult.isFinished(),
                    dbSize
            );
        }
    }

    public static String keyType(ConnectionEntity entity, String key) {
        return RedisClientFactory.withSession(entity, session -> session.sync().type(key));
    }

    public static Long keyTtl(ConnectionEntity entity, String key) {
        return RedisClientFactory.withSession(entity, session -> session.sync().ttl(key));
    }

    public static String keyValuePreview(ConnectionEntity entity, String key, int maxLen) {
        RedisKeyDetailDto detail = fetchKeyDetail(entity, key, maxLen);
        return detail.preview();
    }

    public static RedisKeyDetailDto fetchKeyDetail(ConnectionEntity entity, String key, int maxPreview) {
        try (RedisClientFactory.RedisSession session = RedisClientFactory.open(entity)) {
            RedisCommands<String, String> commands = session.sync();
            String type = commands.type(key);
            if (type == null || "none".equalsIgnoreCase(type)) {
                throw new IllegalArgumentException("Redis key not found: " + key);
            }
            long ttl = commands.ttl(key);
            int limit = Math.max(64, maxPreview);
            if ("string".equalsIgnoreCase(type)) {
                String value = commands.get(key);
                long size = value != null ? value.length() : 0L;
                Preview preview = previewText(value, limit);
                return new RedisKeyDetailDto(key, type.toLowerCase(), ttl, size, preview.text(), preview.truncated());
            }
            long size = resolveSize(commands, type, key);
            Preview preview = buildPreview(commands, type, key, limit);
            return new RedisKeyDetailDto(key, type.toLowerCase(), ttl, size, preview.text(), preview.truncated());
        }
    }

    private static ScanCursor toScanCursor(String cursor) {
        if (cursor == null || cursor.isBlank() || "0".equals(cursor.trim())) {
            return ScanCursor.INITIAL;
        }
        return ScanCursor.of(cursor.trim());
    }

    private static long resolveSize(RedisCommands<String, String> commands, String type, String key) {
        return switch (type.toLowerCase()) {
            case "string" -> {
                String value = commands.get(key);
                yield value != null ? value.length() : 0L;
            }
            case "list" -> commands.llen(key);
            case "set" -> commands.scard(key);
            case "hash" -> commands.hlen(key);
            case "zset" -> commands.zcard(key);
            default -> 0L;
        };
    }

    private static Preview buildPreview(
            RedisCommands<String, String> commands,
            String type,
            String key,
            int limit
    ) {
        return switch (type.toLowerCase()) {
            case "string" -> {
                String value = commands.get(key);
                yield previewText(value, limit);
            }
            case "list" -> previewCollection("list", commands.lrange(key, 0, 49), limit);
            case "set" -> previewCollection("set", new ArrayList<>(commands.smembers(key)), limit);
            case "hash" -> {
                var entries = commands.hgetall(key);
                List<String> lines = new ArrayList<>();
                int count = 0;
                for (var entry : entries.entrySet()) {
                    if (count >= 50) {
                        break;
                    }
                    lines.add(entry.getKey() + " => " + entry.getValue());
                    count++;
                }
                yield previewCollection("hash", lines, limit);
            }
            case "zset" -> {
                var entries = commands.zrangeWithScores(key, 0, 49);
                List<String> lines = new ArrayList<>();
                for (var entry : entries) {
                    lines.add(entry.getValue() + " (" + entry.getScore() + ")");
                }
                yield previewCollection("zset", lines, limit);
            }
            default -> new Preview(type, false);
        };
    }

    private static Preview previewCollection(String label, List<String> items, int limit) {
        if (items == null || items.isEmpty()) {
            return new Preview(label + "(empty)", false);
        }
        String joined = String.join("\n", items);
        if (joined.length() <= limit) {
            return new Preview(label + ":\n" + joined, false);
        }
        return new Preview(label + ":\n" + truncate(joined, limit), true);
    }

    private static Preview previewText(String value, int limit) {
        if (value == null) {
            return new Preview("", false);
        }
        if (value.length() <= limit) {
            return new Preview(value, false);
        }
        return new Preview(truncate(value, limit), true);
    }

    private record Preview(String text, boolean truncated) {
    }

    private static String truncate(String value, int maxLen) {
        if (value == null) {
            return "";
        }
        if (value.length() <= maxLen) {
            return value;
        }
        return value.substring(0, maxLen) + "...";
    }
}
