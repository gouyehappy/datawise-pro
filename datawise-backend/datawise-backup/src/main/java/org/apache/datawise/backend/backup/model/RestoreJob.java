package org.apache.datawise.backend.backup.model;

import java.time.Instant;

public class RestoreJob {

    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_RUNNING = "running";
    public static final String STATUS_SUCCESS = "success";
    public static final String STATUS_FAILED = "failed";
    public static final String STATUS_CANCELLED = "cancelled";
    public static final String STATUS_CANCELLED_PARTIAL = "cancelled_partial";

    public static final String MODE_FULL = "full";
    public static final String MODE_CONNECTIONS_ONLY = "connectionsOnly";
    public static final String MODE_SELECTED_TABLES = "selectedTables";

    private String id;
    private String artifactId;
    private String artifactPath;
    private String type;
    private String mode = MODE_FULL;
    private String targetConnectionId;
    private String targetDatabase;
    private boolean productionAck;
    private String preRestoreSnapshotId;
    private String status = STATUS_PENDING;
    private BackupProgress progress;
    private String message;
    private Instant startedAt;
    private Instant finishedAt;
    private Long createdByUserId;
    private boolean cancelRequested;
    /** Product tenant id — required to rehydrate after process restart. */
    private String tenantId;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getArtifactId() {
        return artifactId;
    }

    public void setArtifactId(String artifactId) {
        this.artifactId = artifactId;
    }

    public String getArtifactPath() {
        return artifactPath;
    }

    public void setArtifactPath(String artifactPath) {
        this.artifactPath = artifactPath;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode;
    }

    public String getTargetConnectionId() {
        return targetConnectionId;
    }

    public void setTargetConnectionId(String targetConnectionId) {
        this.targetConnectionId = targetConnectionId;
    }

    public String getTargetDatabase() {
        return targetDatabase;
    }

    public void setTargetDatabase(String targetDatabase) {
        this.targetDatabase = targetDatabase;
    }

    public boolean isProductionAck() {
        return productionAck;
    }

    public void setProductionAck(boolean productionAck) {
        this.productionAck = productionAck;
    }

    public String getPreRestoreSnapshotId() {
        return preRestoreSnapshotId;
    }

    public void setPreRestoreSnapshotId(String preRestoreSnapshotId) {
        this.preRestoreSnapshotId = preRestoreSnapshotId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public BackupProgress getProgress() {
        return progress;
    }

    public void setProgress(BackupProgress progress) {
        this.progress = progress;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
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

    public Long getCreatedByUserId() {
        return createdByUserId;
    }

    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }

    public boolean isCancelRequested() {
        return cancelRequested;
    }

    public void setCancelRequested(boolean cancelRequested) {
        this.cancelRequested = cancelRequested;
    }

    public String getTenantId() {
        return tenantId;
    }

    public void setTenantId(String tenantId) {
        this.tenantId = tenantId;
    }
}
