package org.apache.datawise.backend.sync.stream;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.sync.api.TableMigrationProgressListener;
import org.apache.datawise.backend.domain.MigrationJobView;
import org.apache.datawise.backend.domain.TableMigrationResult;
import org.apache.datawise.backend.domain.TableMigrationTableBatchProgressEvent;
import org.apache.datawise.backend.domain.TableMigrationTablePhaseEvent;
import org.apache.datawise.backend.domain.TableMigrationTableResultEvent;
import org.apache.datawise.backend.domain.TableMigrationTableStartEvent;
import org.apache.datawise.backend.sse.SseChannels;
import org.apache.datawise.backend.sse.SseEventBus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * 运行中迁移 job 的 SSE 订阅与事件广播。
 * <p>
 * Local emitters stay process-local. When an {@link SseEventBus} is present, broadcasts
 * also publish to the shared bus; remote events are fanned out to local emitters only
 * (self-echo skipped via instance id). Pair with {@code datawise.sse.bus-type=jdbc} for
 * multi-instance delivery without sticky sessions — see {@code docs/DEPLOYMENT.md}.
 * AI analysis SSE remains process-local (sticky + checkpoint resume).
 */
@Component
public class MigrationJobStreamHub {

    private static final Logger log = LoggerFactory.getLogger(MigrationJobStreamHub.class);
    private static final long JOB_SNAPSHOT_THROTTLE_MS = 1_000L;

    private final ConcurrentHashMap<String, CopyOnWriteArrayList<SseEmitter>> subscribers = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Long> lastSnapshotPublishedAtMs = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, AutoCloseable> busSubscriptions = new ConcurrentHashMap<>();

    private final SseEventBus eventBus;
    private final ObjectMapper objectMapper;
    private final String instanceId;

    public MigrationJobStreamHub() {
        this(null, null, "local");
    }

    public MigrationJobStreamHub(SseEventBus eventBus, ObjectMapper objectMapper, String instanceId) {
        this.eventBus = eventBus;
        this.objectMapper = objectMapper != null ? objectMapper : new ObjectMapper().findAndRegisterModules();
        this.instanceId = instanceId == null || instanceId.isBlank() ? "local" : instanceId;
    }

    @Autowired
    public MigrationJobStreamHub(
            ObjectProvider<SseEventBus> eventBusProvider,
            ObjectProvider<ObjectMapper> objectMapperProvider
    ) {
        this(
                eventBusProvider.getIfAvailable(),
                objectMapperProvider.getIfAvailable(),
                resolveBusInstanceId(eventBusProvider.getIfAvailable())
        );
    }

    private static String resolveBusInstanceId(SseEventBus bus) {
        if (bus instanceof org.apache.datawise.backend.sse.InMemorySseEventBus inMemory) {
            return inMemory.instanceId();
        }
        if (bus instanceof org.apache.datawise.backend.sse.JdbcPollingSseEventBus jdbc) {
            return jdbc.instanceId();
        }
        return "local";
    }

    public void subscribe(String jobId, SseEmitter emitter) {
        if (jobId == null || jobId.isBlank() || emitter == null) {
            return;
        }
        CopyOnWriteArrayList<SseEmitter> emitters = subscribers.computeIfAbsent(jobId, ignored -> new CopyOnWriteArrayList<>());
        emitters.add(emitter);
        ensureBusWatch(jobId);
        Runnable cleanup = () -> unsubscribe(jobId, emitter);
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(ignored -> cleanup.run());
    }

    public void unsubscribe(String jobId, SseEmitter emitter) {
        if (jobId == null || jobId.isBlank() || emitter == null) {
            return;
        }
        CopyOnWriteArrayList<SseEmitter> emitters = subscribers.get(jobId);
        if (emitters == null) {
            return;
        }
        emitters.remove(emitter);
        if (emitters.isEmpty()) {
            subscribers.remove(jobId, emitters);
            releaseBusWatch(jobId);
        }
    }

    public TableMigrationProgressListener progressListener(String jobId, Supplier<MigrationJobView> snapshotSupplier) {
        return new TableMigrationProgressListener() {
            @Override
            public void onTableStart(int tableIndex, int tableTotal, String tableName) {
                broadcast(jobId, "table_start", new TableMigrationTableStartEvent(tableIndex, tableTotal, tableName));
                publishSnapshot(jobId, snapshotSupplier);
            }

            @Override
            public void onTableResult(int tableIndex, int tableTotal, TableMigrationResult result) {
                broadcast(jobId, "table_result", new TableMigrationTableResultEvent(tableIndex, tableTotal, result));
                publishSnapshot(jobId, snapshotSupplier);
            }

            @Override
            public void onBatchProgress(
                    int tableIndex,
                    int tableTotal,
                    String tableName,
                    long offset,
                    long rowsMigrated,
                    int batches
            ) {
                broadcast(
                        jobId,
                        "batch_progress",
                        new TableMigrationTableBatchProgressEvent(
                                tableIndex,
                                tableTotal,
                                tableName,
                                offset,
                                rowsMigrated,
                                batches
                        )
                );
                publishSnapshotThrottled(jobId, snapshotSupplier);
            }

            @Override
            public void onTablePhase(int tableIndex, int tableTotal, String tableName, String phase) {
                broadcast(
                        jobId,
                        "table_phase",
                        new TableMigrationTablePhaseEvent(tableIndex, tableTotal, tableName, phase)
                );
                publishSnapshotThrottled(jobId, snapshotSupplier);
            }
        };
    }

    public void publishSnapshot(String jobId, MigrationJobView view) {
        if (view == null) {
            return;
        }
        broadcast(jobId, "job_snapshot", view);
    }

    public void publishPaused(String jobId, MigrationJobView view) {
        lastSnapshotPublishedAtMs.remove(jobId);
        broadcast(jobId, "job_paused", view);
        completeAll(jobId);
    }

    public void publishDone(String jobId, MigrationJobView view) {
        lastSnapshotPublishedAtMs.remove(jobId);
        broadcast(jobId, "job_done", view);
        completeAll(jobId);
    }

    private void publishSnapshotThrottled(String jobId, Supplier<MigrationJobView> snapshotSupplier) {
        if (jobId == null || jobId.isBlank() || snapshotSupplier == null) {
            return;
        }
        long now = System.currentTimeMillis();
        Long last = lastSnapshotPublishedAtMs.get(jobId);
        if (last != null && now - last < JOB_SNAPSHOT_THROTTLE_MS) {
            return;
        }
        lastSnapshotPublishedAtMs.put(jobId, now);
        publishSnapshot(jobId, snapshotSupplier);
    }

    private void publishSnapshot(String jobId, Supplier<MigrationJobView> snapshotSupplier) {
        if (snapshotSupplier == null) {
            return;
        }
        try {
            MigrationJobView view = snapshotSupplier.get();
            if (view != null) {
                publishSnapshot(jobId, view);
            }
        } catch (RuntimeException ex) {
            ExceptionLogging.recoverable(log, "Migration job snapshot publish failed jobId=" + jobId, ex);
        }
    }

    private void broadcast(String jobId, String eventName, Object data) {
        publishToBus(jobId, eventName, data);
        fanOutLocal(jobId, eventName, data);
    }

    private void publishToBus(String jobId, String eventName, Object data) {
        if (eventBus == null || jobId == null || jobId.isBlank() || eventName == null) {
            return;
        }
        try {
            String json = objectMapper.writeValueAsString(data);
            eventBus.publish(SseChannels.migrationJob(jobId), eventName, json, instanceId);
        } catch (JsonProcessingException ex) {
            ExceptionLogging.recoverable(log, "Migration job SSE bus serialize failed event=" + eventName, ex);
        } catch (RuntimeException ex) {
            ExceptionLogging.recoverable(log, "Migration job SSE bus publish failed event=" + eventName, ex);
        }
    }

    private void onBusEvent(String channel, String eventName, String payloadJson, String originInstanceId) {
        if (Objects.equals(instanceId, originInstanceId)) {
            return;
        }
        String jobId = SseChannels.migrationJobId(channel);
        if (jobId == null) {
            return;
        }
        fanOutLocalJson(jobId, eventName, payloadJson);
        if ("job_done".equals(eventName) || "job_paused".equals(eventName)) {
            completeAll(jobId);
        }
    }

    private void fanOutLocal(String jobId, String eventName, Object data) {
        CopyOnWriteArrayList<SseEmitter> emitters = subscribers.get(jobId);
        if (emitters == null || emitters.isEmpty()) {
            return;
        }
        for (SseEmitter emitter : List.copyOf(emitters)) {
            try {
                emitter.send(SseEmitter.event().name(eventName).data(data));
            } catch (IOException ex) {
                unsubscribe(jobId, emitter);
                ExceptionLogging.recoverable(log, "Migration job SSE send failed event=" + eventName, ex);
            } catch (IllegalStateException ex) {
                unsubscribe(jobId, emitter);
                ExceptionLogging.recoverable(
                        log,
                        "Migration job SSE send failed (emitter closed) event=" + eventName,
                        ex
                );
            }
        }
    }

    private void fanOutLocalJson(String jobId, String eventName, String payloadJson) {
        JsonNode node;
        try {
            node = objectMapper.readTree(payloadJson == null ? "null" : payloadJson);
        } catch (JsonProcessingException ex) {
            ExceptionLogging.recoverable(log, "Migration job SSE bus deserialize failed event=" + eventName, ex);
            return;
        }
        fanOutLocal(jobId, eventName, node);
    }

    private void ensureBusWatch(String jobId) {
        if (eventBus == null) {
            return;
        }
        busSubscriptions.computeIfAbsent(jobId, id -> eventBus.subscribe(
                SseChannels.migrationJob(id),
                this::onBusEvent
        ));
    }

    private void releaseBusWatch(String jobId) {
        AutoCloseable handle = busSubscriptions.remove(jobId);
        if (handle == null) {
            return;
        }
        try {
            handle.close();
        } catch (Exception ex) {
            ExceptionLogging.recoverable(log, "Migration job SSE bus unsubscribe failed jobId=" + jobId, ex);
        }
    }

    private void completeAll(String jobId) {
        lastSnapshotPublishedAtMs.remove(jobId);
        releaseBusWatch(jobId);
        CopyOnWriteArrayList<SseEmitter> emitters = subscribers.remove(jobId);
        if (emitters == null) {
            return;
        }
        for (SseEmitter emitter : emitters) {
            try {
                emitter.complete();
            } catch (Exception ex) {
                ExceptionLogging.recoverable(log, "Migration job SSE complete failed jobId=" + jobId, ex);
            }
        }
    }
}
