package org.apache.datawise.backend.sync.stream;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.domain.MigrationJobView;
import org.apache.datawise.backend.domain.TableMigrationBatchResult;
import org.apache.datawise.backend.domain.TableMigrationResult;
import org.apache.datawise.backend.domain.TableMigrationTableBatchProgressEvent;
import org.apache.datawise.backend.domain.TableMigrationTableResultEvent;
import org.apache.datawise.backend.domain.TableMigrationTableStartEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;

/** 表迁移批量 SSE 事件发送。 */
public final class TableMigrationStreamEmitter {

    private static final Logger log = LoggerFactory.getLogger(TableMigrationStreamEmitter.class);
    private static final long SSE_TIMEOUT_MS = 3_600_000L;

    private TableMigrationStreamEmitter() {
    }

    public static SseEmitter createEmitter() {
        return new SseEmitter(SSE_TIMEOUT_MS);
    }

    public static void sendTableStart(
            SseEmitter emitter,
            int tableIndex,
            int tableTotal,
            String tableName
    ) {
        send(emitter, "table_start", new TableMigrationTableStartEvent(tableIndex, tableTotal, tableName));
    }

    public static void sendTableResult(
            SseEmitter emitter,
            int tableIndex,
            int tableTotal,
            TableMigrationResult result
    ) {
        send(emitter, "table_result", new TableMigrationTableResultEvent(tableIndex, tableTotal, result));
    }

    public static void sendBatchProgress(
            SseEmitter emitter,
            int tableIndex,
            int tableTotal,
            String tableName,
            long offset,
            long rowsMigrated,
            int batches
    ) {
        send(
                emitter,
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
    }

    public static void sendDone(SseEmitter emitter, TableMigrationBatchResult result) {
        send(emitter, "done", result);
    }

    public static void sendJobPaused(SseEmitter emitter, MigrationJobView view) {
        send(emitter, "job_paused", view);
    }

    public static void sendJobSnapshot(SseEmitter emitter, MigrationJobView view) {
        send(emitter, "job_snapshot", view);
    }

    public static void sendJobDone(SseEmitter emitter, MigrationJobView view) {
        send(emitter, "job_done", view);
    }

    public static boolean isTerminalJobStatus(String status) {
        return "completed".equals(status)
                || "partial".equals(status)
                || "failed".equals(status)
                || "paused".equals(status)
                || "cancelled".equals(status);
    }

    public static void sendTerminalJobEvent(SseEmitter emitter, MigrationJobView view) {
        if ("paused".equals(view.status())) {
            sendJobPaused(emitter, view);
        } else {
            sendJobDone(emitter, view);
        }
    }

    public static void sendError(SseEmitter emitter, Throwable error) {
        try {
            String message = error != null && error.getMessage() != null ? error.getMessage() : "Migration failed";
            emitter.send(SseEmitter.event().name("error").data(Map.of("message", message)));
        } catch (IOException ex) {
            ExceptionLogging.recoverable(log, "Migration SSE error event send failed (client disconnected?)", ex);
        }
    }

    public static void completeSuccess(SseEmitter emitter) {
        emitter.complete();
    }

    public static void completeFailure(SseEmitter emitter, Throwable error, Logger log) {
        sendError(emitter, error);
        if (log != null && error != null) {
            ExceptionLogging.error(log, "Table migration stream failed", error);
        }
        // Keep SSE failure handling inside the stream lifecycle.
        // completeWithError may re-enter MVC exception resolution with
        // text/event-stream response semantics and cause converter mismatches.
        emitter.complete();
    }

    private static void send(SseEmitter emitter, String eventName, Object data) {
        try {
            emitter.send(SseEmitter.event().name(eventName).data(data));
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to send migration SSE event: " + eventName, ex);
        }
    }
}
