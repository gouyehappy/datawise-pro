package org.apache.datawise.backend.redis;

import io.lettuce.core.RedisClient;
import io.lettuce.core.RedisURI;
import io.lettuce.core.api.StatefulRedisConnection;
import io.lettuce.core.api.sync.RedisCommands;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.time.Duration;
import java.util.Objects;
import java.util.function.Function;

/**
 * Creates short-lived Lettuce sessions from {@link ConnectionEntity}.
 * <p>
 * Each {@link #open(ConnectionEntity)} owns both the {@link RedisClient} and its connection;
 * callers must close the session (try-with-resources) so client event-loop threads are released.
 */
public final class RedisClientFactory {

    private RedisClientFactory() {
    }

    public static RedisSession open(ConnectionEntity entity) {
        Objects.requireNonNull(entity, "entity");
        RedisURI uri = RedisURI.builder()
                .withHost(entity.getHost())
                .withPort(parsePort(entity.getPort()))
                .withDatabase(parseDb(entity.getDatabaseName()))
                .withTimeout(Duration.ofSeconds(5))
                .build();
        if (entity.getUsername() != null && !entity.getUsername().isBlank()) {
            uri.setUsername(entity.getUsername());
        }
        if (entity.getPassword() != null && !entity.getPassword().isBlank()) {
            uri.setPassword(entity.getPassword().toCharArray());
        }
        RedisClient client = RedisClient.create(uri);
        try {
            return new RedisSession(client, client.connect());
        } catch (RuntimeException ex) {
            client.shutdown();
            throw ex;
        }
    }

    /** Opens a session, runs {@code action}, then closes client + connection. */
    public static <T> T withSession(ConnectionEntity entity, Function<RedisSession, T> action) {
        try (RedisSession session = open(entity)) {
            return action.apply(session);
        }
    }

    static int parsePort(String port) {
        if (port == null || port.isBlank()) {
            return 6379;
        }
        try {
            return Integer.parseInt(port.trim());
        } catch (NumberFormatException ex) {
            return 6379;
        }
    }

    static int parseDb(String databaseName) {
        if (databaseName == null || databaseName.isBlank()) {
            return 0;
        }
        try {
            return Math.max(0, Integer.parseInt(databaseName.trim()));
        } catch (NumberFormatException ex) {
            return 0;
        }
    }

    /** AutoCloseable Lettuce client + connection pair. */
    public static final class RedisSession implements AutoCloseable {
        private final RedisClient client;
        private final StatefulRedisConnection<String, String> connection;

        RedisSession(RedisClient client, StatefulRedisConnection<String, String> connection) {
            this.client = client;
            this.connection = connection;
        }

        public RedisCommands<String, String> sync() {
            return connection.sync();
        }

        public StatefulRedisConnection<String, String> connection() {
            return connection;
        }

        @Override
        public void close() {
            try {
                connection.close();
            } finally {
                client.shutdown();
            }
        }
    }
}
