package org.apache.datawise.backend.domain;

/** Stable outbound notification event type identifiers. */
public final class OutboundEventType {

    public static final String SCHEDULED_TASK_OK = "scheduled_task.ok";
    public static final String SCHEDULED_TASK_FAILED = "scheduled_task.failed";
    public static final String PROD_APPROVAL_PENDING = "prod.approval.pending";
    public static final String PROD_APPROVAL_DECIDED = "prod.approval.decided";
    public static final String SCHEMA_DRIFT_DETECTED = "schema_drift.detected";
    public static final String SCHEMA_DRIFT_CLEAN = "schema_drift.clean";
    public static final String AUDIT_APPENDED = "audit.appended";
    public static final String INSIGHT_DIGEST = "insight.digest";
    /** Manual or automated Insight → ticket / runbook export. */
    public static final String INSIGHT_ACTION = "insight.action";
    public static final String DATA_QUALITY_OK = "data_quality.ok";
    public static final String DATA_QUALITY_FAILED = "data_quality.failed";
    public static final String ORCHESTRATION_TRIGGERED = "orchestration.triggered";
    public static final String ORCHESTRATION_FAILED = "orchestration.failed";
    /** Tenant AI daily quota crossed into near-limit band (≤10% or ≤5 remaining). */
    public static final String AI_QUOTA_NEAR_LIMIT = "ai.quota.near_limit";
    /** Tenant AI daily quota fully consumed. */
    public static final String AI_QUOTA_EXHAUSTED = "ai.quota.exhausted";
    public static final String CONNECTION_HEALTH_FAILED = "connection.health.failed";
    public static final String CONNECTION_CREATED = "connection.created";
    public static final String CONNECTION_DELETED = "connection.deleted";
    public static final String TABLE_CREATED = "table.created";
    public static final String TABLE_DELETED = "table.deleted";
    /** Successful ALTER TABLE (or equivalent) that was recorded in DDL history. */
    public static final String TABLE_ALTERED = "table.altered";
    public static final String MIGRATION_JOB_FAILED = "migration.job.failed";
    public static final String MIGRATION_JOB_COMPLETED = "migration.job.completed";
    public static final String SQL_EXECUTION_FAILED = "sql.execution.failed";
    public static final String SQL_PRODUCTION_BLOCKED = "sql.production.blocked";
    public static final String TEAM_INVITE_PENDING = "team.invite.pending";
    public static final String OUTBOUND_TEST = "outbound.test";
    public static final String BACKUP_OK = "backup.ok";
    public static final String BACKUP_FAILED = "backup.failed";

    private OutboundEventType() {
    }
}
