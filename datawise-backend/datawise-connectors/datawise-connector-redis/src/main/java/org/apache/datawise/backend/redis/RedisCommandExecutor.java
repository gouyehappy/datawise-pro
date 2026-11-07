package org.apache.datawise.backend.redis;

import io.lettuce.core.api.sync.RedisCommands;
import io.lettuce.core.codec.StringCodec;
import io.lettuce.core.output.NestedMultiOutput;
import io.lettuce.core.protocol.CommandArgs;
import io.lettuce.core.protocol.ProtocolKeyword;
import org.apache.datawise.backend.connector.api.support.RedisCommandPolicy;
import org.apache.datawise.backend.domain.RedisCommandResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.connector.redis.support.RedisConnectionErrors;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Parses and executes arbitrary Redis commands. */
public final class RedisCommandExecutor {

    private RedisCommandExecutor() {
    }

    public static RedisCommandResultDto execute(ConnectionEntity entity, String commandLine) {
        RedisCommandPolicy.requireAllowed(commandLine);
        List<String> tokens = parseCommandLine(commandLine.trim());
        if (tokens.isEmpty()) {
            throw new IllegalArgumentException("Redis command is required");
        }
        String command = tokens.get(0);
        List<String> args = tokens.size() > 1 ? tokens.subList(1, tokens.size()) : List.of();
        long started = System.nanoTime();
        try (RedisClientFactory.RedisSession session = RedisClientFactory.open(entity)) {
            Object result = dispatchCommand(session.sync(), command, args);
            long durationMs = (System.nanoTime() - started) / 1_000_000L;
            return new RedisCommandResultDto(
                    commandLine.trim(),
                    formatCommandResult(result),
                    true,
                    null,
                    durationMs
            );
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            long durationMs = (System.nanoTime() - started) / 1_000_000L;
            return new RedisCommandResultDto(
                    commandLine.trim(),
                    "",
                    false,
                    RedisConnectionErrors.toCommandErrorMessage(entity, ex),
                    durationMs
            );
        }
    }

    public static List<String> parseCommandLine(String line) {
        List<String> tokens = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (ch == '"') {
                inQuotes = !inQuotes;
                continue;
            }
            if (!inQuotes && Character.isWhitespace(ch)) {
                if (!current.isEmpty()) {
                    tokens.add(current.toString());
                    current.setLength(0);
                }
                continue;
            }
            current.append(ch);
        }
        if (!current.isEmpty()) {
            tokens.add(current.toString());
        }
        return tokens;
    }

    public static String formatCommandResult(Object value) {
        if (value == null) {
            return "(nil)";
        }
        if (value instanceof Long longValue) {
            return Long.toString(longValue);
        }
        if (value instanceof Integer intValue) {
            return Integer.toString(intValue);
        }
        if (value instanceof Double doubleValue) {
            return Double.toString(doubleValue);
        }
        if (value instanceof Boolean boolValue) {
            return boolValue ? "1" : "0";
        }
        if (value instanceof byte[] bytes) {
            return new String(bytes, StandardCharsets.UTF_8);
        }
        if (value instanceof ByteBuffer buffer) {
            byte[] bytes = new byte[buffer.remaining()];
            buffer.get(bytes);
            return new String(bytes, StandardCharsets.UTF_8);
        }
        if (value instanceof List<?> list) {
            if (list.isEmpty()) {
                return "(empty list)";
            }
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < list.size(); i++) {
                if (i > 0) {
                    sb.append('\n');
                }
                sb.append(i + 1).append(") ").append(formatCommandResult(list.get(i)));
            }
            return sb.toString();
        }
        return String.valueOf(value);
    }

    private static Object dispatchCommand(RedisCommands<String, String> commands, String command, List<String> args) {
        ProtocolKeyword protocolKeyword = new DynamicCommand(command.toUpperCase());
        CommandArgs<String, String> commandArgs = new CommandArgs<>(StringCodec.UTF8);
        for (String arg : args) {
            commandArgs.add(arg);
        }
        return commands.dispatch(protocolKeyword, new NestedMultiOutput<>(StringCodec.UTF8), commandArgs);
    }

    private static final class DynamicCommand implements ProtocolKeyword {
        private final String name;

        private DynamicCommand(String name) {
            this.name = name;
        }

        @Override
        public String name() {
            return name;
        }

        @Override
        public byte[] getBytes() {
            return name.getBytes(StandardCharsets.US_ASCII);
        }
    }
}
