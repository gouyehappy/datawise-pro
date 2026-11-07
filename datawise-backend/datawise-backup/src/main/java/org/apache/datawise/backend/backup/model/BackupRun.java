package org.apache.datawise.backend.backup.model;

import java.time.Instant;

public class BackupRun {

    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_RUNNING = "running";
    public static final String STATUS_SUCCESS = "success";
    public static final String STATUS_FAILED = "failed";
    public static final String STATUS_CANCELLED = "cancelled";
    public static final String STATUS_PARTIAL = "partial";

    public static final String TRIGGER_MANUAL = "manual";
    public static final String TRIGGER_SCHEDULE = "schedule";
    public static final String TRIGGER_API = "api";
    public static final String TRIGGER_PRE_RESTORE = "pre_restore";

    private String id;
    private String policyId;
    private String type;
    private String trigger = TRIGGER_MANUAL;
    private String status = STATUS_PENDING;
    private Instant startedAt;
    private Instant finishedAt;
    private String artifactPath;
    private String artifactId;
    private String message;
    private BackupProgress progress;
    private boolean cancelRequested;
    private Long createdByUserId;
    /** Product tenant id — required to rehydrate after process restart. */
    private String tenantId;
    /** Frozen policy used for this run (supports ad-hoc and restart recovery). */
    private BackupPolicy policySnapshot;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getPolicyId() {
        return policyId;
    }

    public void setPolicyId(String policyId) {
        this.policyId = policyId;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getTrigger() {
        return trigger;
    }

    public void setTrigger(String trigger) {
        this.trigger = trigger;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(Instant startedAt) {
        this.startedAt = startedAt;
    }

    public Instant getFinishedAt() {
        return finishedAt;
    }

    public void setFinishedAt(Instant finishedAt) {
        this.finishedAt = finishedAt;
    }

    public String getArtifactPath() {
        return artifactPath;
    }

    public void setArtifactPath(String artifactPath) {
        this.artifactPath = artifactPath;
    }

    public String getArtifactId() {
        return artifactId;
    }

    public void setArtifactId(String artifactId) {
        this.artifactId = artifactId;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public BackupProgress getProgress() {
        return progress;
    }

    public void setProgress(BackupProgress progress) {
        this.progress = progress;
    }

    public boolean isCancelRequested() {
        return cancelRequested;
    }

    public void setCancelRequested(boolean cancelRequested) {
        this.cancelRequested = cancelRequested;
    }

    public Long getCreatedByUserId() {
        return createdByUserId;
    }

    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }

    public String getTenantId() {
        return tenantId;
    }

    public void setTenantId(String tenantId) {
        this.tenantId = tenantId;
    }

    public BackupPolicy getPolicySnapshot() {
        return policySnapshot;
    }

    public void setPolicySnapshot(BackupPolicy policySnapshot) {
        this.policySnapshot = policySnapshot;
    }
}
