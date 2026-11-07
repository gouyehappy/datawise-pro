package org.apache.datawise.backend.service.outbound;

import org.apache.datawise.backend.domain.OutboundEventType;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Typed outbound signals for current-user events.
 * Prefer this over scattering {@link OutboundNotifySupport#publish} maps at call sites.
 * Method-boundary cases may still use {@code @OutboundNotify} directly.
 */
@Component
public class OutboundEventSignals {

    private final OutboundNotifySupport notifySupport;

    public OutboundEventSignals(OutboundNotifySupport notifySupport) {
        this.notifySupport = notifySupport;
    }

    public void connectionHealthFailed(String connectionId, String name, String message, long latencyMs) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("connectionId", nullToEmpty(connectionId));
        data.put("name", nullToEmpty(name));
        data.put("message", nullToEmpty(message));
        data.put("latencyMs", latencyMs);
        notifySupport.publish(OutboundEventType.CONNECTION_HEALTH_FAILED, data, UserContext.getUserId());
    }

    public void connectionCreated(String connectionId, String name, String dbType) {
        connectionCreated(connectionId, name, dbType, UserContext.getUserId());
    }

    public void connectionCreated(String connectionId, String name, String dbType, Long userId) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("connectionId", nullToEmpty(connectionId));
        data.put("name", nullToEmpty(name));
        data.put("dbType", nullToEmpty(dbType));
        notifySupport.publish(OutboundEventType.CONNECTION_CREATED, data, userId);
    }

    public void connectionDeleted(String connectionId, String name, String dbType) {
        connectionDeleted(connectionId, name, dbType, UserContext.getUserId());
    }

    public void connectionDeleted(String connectionId, String name, String dbType, Long userId) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("connectionId", nullToEmpty(connectionId));
        data.put("name", nullToEmpty(name));
        data.put("dbType", nullToEmpty(dbType));
        notifySupport.publish(OutboundEventType.CONNECTION_DELETED, data, userId);
    }

    public void tableCreated(
                             String connectionId,
                             String name,
                             String database,
                             String tableName,
                             Long userId) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("connectionId", nullToEmpty(connectionId));
        data.put("name", nullToEmpty(name));
        data.put("database", nullToEmpty(database));
        data.put("tableName", nullToEmpty(tableName));
        notifySupport.publish(OutboundEventType.TABLE_CREATED, data, userId);
    }

    public void tableDeleted(
                             String connectionId,
                             String name,
                             String database,
                             String tableName,
                             Long userId) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("connectionId", nullToEmpty(connectionId));
        data.put("name", nullToEmpty(name));
        data.put("database", nullToEmpty(database));
        data.put("tableName", nullToEmpty(tableName));
        notifySupport.publish(OutboundEventType.TABLE_DELETED, data, userId);
    }

    public void sqlExecutionFailed(String connectionId, String name, String database, String message) {
        sqlExecutionFailed(connectionId, name, database, message, UserContext.getUserId());
    }

    public void sqlExecutionFailed(
                                   String connectionId,
                                   String name,
                                   String database,
                                   String message,
                                   Long userId) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("connectionId", nullToEmpty(connectionId));
        data.put("name", nullToEmpty(name));
        data.put("database", nullToEmpty(database));
        data.put("message", nullToEmpty(message));
        notifySupport.publish(OutboundEventType.SQL_EXECUTION_FAILED, data, userId);
    }

    public void schemaDriftDetected(String monitorId, int driftCount) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("monitorId", nullToEmpty(monitorId));
        data.put("driftCount", driftCount);
        notifySupport.publish(OutboundEventType.SCHEMA_DRIFT_DETECTED, data, UserContext.getUserId());
    }

    public void schemaDriftClean(String monitorId, int driftCount) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("monitorId", nullToEmpty(monitorId));
        data.put("driftCount", driftCount);
        notifySupport.publish(OutboundEventType.SCHEMA_DRIFT_CLEAN, data, UserContext.getUserId());
    }

    public void aiQuotaNearLimit(String tenantId, int calls, int limit, int remaining) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("tenantId", nullToEmpty(tenantId));
        data.put("calls", calls);
        data.put("limit", limit);
        data.put("remaining", remaining);
        notifySupport.publish(OutboundEventType.AI_QUOTA_NEAR_LIMIT, data, UserContext.getUserId());
    }

    public void aiQuotaExhausted(String tenantId, int calls, int limit) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("tenantId", nullToEmpty(tenantId));
        data.put("calls", calls);
        data.put("limit", limit);
        notifySupport.publish(OutboundEventType.AI_QUOTA_EXHAUSTED, data, UserContext.getUserId());
    }

    public void migrationJobCompleted(
                                      String jobId,
                                      String sourceConnectionId,
                                      String targetConnectionId,
                                      int tableCount) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("jobId", nullToEmpty(jobId));
        data.put("sourceConnectionId", nullToEmpty(sourceConnectionId));
        data.put("targetConnectionId", nullToEmpty(targetConnectionId));
        data.put("tableCount", tableCount);
        notifySupport.publish(OutboundEventType.MIGRATION_JOB_COMPLETED, data, UserContext.getUserId());
    }

    public void migrationJobFailed(
                                   String jobId,
                                   String sourceConnectionId,
                                   String targetConnectionId,
                                   int tableCount,
                                   String message) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("jobId", nullToEmpty(jobId));
        data.put("sourceConnectionId", nullToEmpty(sourceConnectionId));
        data.put("targetConnectionId", nullToEmpty(targetConnectionId));
        data.put("tableCount", tableCount);
        data.put("message", nullToEmpty(message));
        notifySupport.publish(OutboundEventType.MIGRATION_JOB_FAILED, data, UserContext.getUserId());
    }

    private static String nullToEmpty(String value) {
        return value != null ? value : "";
    }
}
