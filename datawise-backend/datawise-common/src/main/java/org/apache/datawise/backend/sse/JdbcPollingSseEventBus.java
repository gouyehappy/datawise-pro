package org.apache.datawise.backend.sse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Cross-instance SSE bus backed by metadata JDBC table {@code dw_sse_events}.
 * <p>
 * Requires Flyway migration {@code V10__sse_events.sql} and
 * {@code datawise.storage.backend=jdbc}.
 */
public final class JdbcPollingSseEventBus implements SseEventBus {

    private static final Logger log = LoggerFactory.getLogger(JdbcPollingSseEventBus.class);
    private static final int POLL_BATCH = 200;

    private final DataSource dataSource;
    private final String instanceId;
    private final Duration retention;
    private final ConcurrentHashMap<String, CopyOnWriteArrayList<SseEventListener>> listeners =
            new ConcurrentHashMap<>();
    private final AtomicLong lastSeenId = new AtomicLong(0L);
    private final AtomicBoolean started = new AtomicBoolean(false);
    private final ScheduledExecutorService scheduler;

    public JdbcPollingSseEventBus(DataSource dataSource, Duration pollInterval, Duration retention) {
        this(dataSource, UUID.randomUUID().toString(), pollInterval, retention);
    }

    public JdbcPollingSseEventBus(
                                  DataSource dataSource,
                                  String instanceId,
                                  Duration pollInterval,
                                  Duration retention) {
        this.dataSource = Objects.requireNonNull(dataSource, "dataSource");
        this.instanceId = Objects.requireNonNull(instanceId, "instanceId");
        this.retention = retention == null ? Duration.ofMinutes(5) : retention;
        Duration interval = pollInterval == null || pollInterval.isNegative() || pollInterval.isZero()
                ? Duration.ofMillis(500)
                : pollInterval;
        this.scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "dw-sse-jdbc-poll");
            t.setDaemon(true);
            return t;
        });
        bootstrapCursor();
        long periodMs = Math.max(50L, interval.toMillis());
        scheduler.scheduleWithFixedDelay(this::pollSafely, periodMs, periodMs, TimeUnit.MILLISECONDS);
        scheduler.scheduleWithFixedDelay(this::retainSafely, periodMs * 20, periodMs * 20, TimeUnit.MILLISECONDS);
        started.set(true);
    }

    public String instanceId() {
        return instanceId;
    }

    @Override
    public void publish(String channel, String eventName, String payloadJson) {
        publish(channel, eventName, payloadJson, instanceId);
    }

    @Override
    public void publish(String channel, String eventName, String payloadJson, String originInstanceId) {
        if (channel == null || channel.isBlank() || eventName == null || eventName.isBlank()) {
            return;
        }
        String payload = payloadJson == null ? "null" : payloadJson;
        String origin = originInstanceId == null || originInstanceId.isBlank() ? instanceId : originInstanceId;
        String sql = """
                INSERT INTO dw_sse_events(channel, event_name, payload_json, origin_instance_id, created_at)
                VALUES (?, ?, ?, ?, ?)
                """;
        try (
                Connection conn = dataSource.getConnection();
                PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, channel);
            ps.setString(2, eventName);
            ps.setString(3, payload);
            ps.setString(4, origin);
            ps.setTimestamp(5, Timestamp.from(Instant.now()));
            ps.executeUpdate();
        } catch (SQLException ex) {
            throw new IllegalStateException("Failed to publish SSE event to JDBC bus", ex);
        }
    }

    @Override
    public AutoCloseable subscribe(String channel, SseEventListener listener) {
        Objects.requireNonNull(listener, "listener");
        if (channel == null || channel.isBlank()) {
            return () -> {
            };
        }
        CopyOnWriteArrayList<SseEventListener> channelListeners =
                listeners.computeIfAbsent(channel, ignored -> new CopyOnWriteArrayList<>());
        channelListeners.add(listener);
        return () -> {
            channelListeners.remove(listener);
            if (channelListeners.isEmpty()) {
                listeners.remove(channel, channelListeners);
            }
        };
    }

    @Override
    public void close() {
        if (!started.compareAndSet(true, false)) {
            return;
        }
        scheduler.shutdownNow();
        listeners.clear();
    }

    private void bootstrapCursor() {
        try (
                Connection conn = dataSource.getConnection();
                Statement st = conn.createStatement();
                ResultSet rs = st.executeQuery("SELECT COALESCE(MAX(id), 0) FROM dw_sse_events")) {
            if (rs.next()) {
                lastSeenId.set(rs.getLong(1));
            }
        } catch (SQLException ex) {
            log.warn("SSE JDBC bus could not read cursor; starting at 0", ex);
        }
    }

    private void pollSafely() {
        try {
            pollOnce();
        } catch (RuntimeException ex) {
            log.warn("SSE JDBC bus poll failed", ex);
        }
    }

    private void pollOnce() {
        long afterId = lastSeenId.get();
        String sql = """
                SELECT id, channel, event_name, payload_json, origin_instance_id
                FROM dw_sse_events
                WHERE id > ?
                ORDER BY id
                """;
        List<Row> rows = new ArrayList<>();
        try (
                Connection conn = dataSource.getConnection();
                PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setLong(1, afterId);
            // Portable cap across PG / MySQL / H2 (avoid FETCH FIRST / LIMIT dialect splits).
            ps.setMaxRows(POLL_BATCH);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    rows.add(new Row(
                            rs.getLong(1),
                            rs.getString(2),
                            rs.getString(3),
                            rs.getString(4),
                            rs.getString(5)));
                }
            }
        } catch (SQLException ex) {
            throw new IllegalStateException("SSE JDBC bus poll query failed", ex);
        }
        long maxId = afterId;
        for (Row row : rows) {
            maxId = Math.max(maxId, row.id());
            dispatch(row);
        }
        if (maxId > afterId) {
            final long newMax = maxId;
            lastSeenId.updateAndGet(current -> Math.max(current, newMax));
        }
    }

    private void dispatch(Row row) {
        CopyOnWriteArrayList<SseEventListener> channelListeners = listeners.get(row.channel());
        if (channelListeners == null || channelListeners.isEmpty()) {
            return;
        }
        for (SseEventListener listener : List.copyOf(channelListeners)) {
            try {
                listener.onEvent(row.channel(), row.eventName(), row.payloadJson(), row.originInstanceId());
            } catch (RuntimeException ex) {
                log.warn("SSE JDBC bus listener failed channel={} event={}", row.channel(), row.eventName(), ex);
            }
        }
    }

    private void retainSafely() {
        try {
            Instant cutoff = Instant.now().minus(retention);
            try (
                    Connection conn = dataSource.getConnection();
                    PreparedStatement ps = conn.prepareStatement(
                            "DELETE FROM dw_sse_events WHERE created_at < ?")) {
                ps.setTimestamp(1, Timestamp.from(cutoff));
                ps.executeUpdate();
            }
        } catch (SQLException | RuntimeException ex) {
            log.warn("SSE JDBC bus retention cleanup failed", ex);
        }
    }

    private record Row(
            long id,
            String channel,
            String eventName,
            String payloadJson,
            String originInstanceId) {
    }
}
