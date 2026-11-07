package org.apache.datawise.backend.connector.api.support;

import java.util.Locale;
import java.util.Set;

/**
 * Blocks destructive or privileged Redis commands for Explorer and connector console paths.
 */
public final class RedisCommandPolicy {

    private static final Set<String> BLOCKED = Set.of(
            "FLUSHALL",
            "FLUSHDB",
            "CONFIG",
            "SHUTDOWN",
            "DEBUG",
            "SLAVEOF",
            "REPLICAOF",
            "CLUSTER",
            "MIGRATE",
            "RESTORE",
            "SCRIPT",
            "EVAL",
            "EVALSHA",
            "MODULE",
            "ACL",
            "SAVE",
            "BGSAVE",
            "BGREWRITEAOF",
            "FAILOVER",
            "SWAPDB");

    private RedisCommandPolicy() {
    }

    public static void requireAllowed(String commandLine) {
        if (commandLine == null || commandLine.isBlank()) {
            throw new IllegalArgumentException("Redis command is required");
        }
        String command = firstToken(commandLine);
        if (command.isEmpty()) {
            throw new IllegalArgumentException("Redis command is required");
        }
        if (BLOCKED.contains(command)) {
            throw new IllegalArgumentException("Redis command is not allowed: " + command);
        }
    }

    static String firstToken(String commandLine) {
        boolean inQuotes = false;
        StringBuilder current = new StringBuilder();
        for (int i = 0; i < commandLine.length(); i++) {
            char ch = commandLine.charAt(i);
            if (ch == '"') {
                inQuotes = !inQuotes;
                continue;
            }
            if (!inQuotes && Character.isWhitespace(ch)) {
                if (!current.isEmpty()) {
                    return current.toString().toUpperCase(Locale.ROOT);
                }
                continue;
            }
            current.append(ch);
        }
        return current.toString().trim().toUpperCase(Locale.ROOT);
    }
}
