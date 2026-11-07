package org.apache.datawise.backend.domain;

import java.time.Instant;

/** 单表迁移断点：全量分批 offset 与进度。 */
public class MigrationTableCheckpoint {

    private String tableName;
    private String status;
    private long lastOffset;
    private long rowsMigrated;
    private int batchesCompleted;
    private String lastWatermark;
    private String lastSeekKey;
    private String requestFingerprint;
    private Instant updatedAt;

    public String getTableName() {
        return tableName;
    }

    public void setTableName(String tableName) {
        this.tableName = tableName;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public long getLastOffset() {
        return lastOffset;
    }

    public void setLastOffset(long lastOffset) {
        this.lastOffset = lastOffset;
    }

    public long getRowsMigrated() {
        return rowsMigrated;
    }

    public void setRowsMigrated(long rowsMigrated) {
        this.rowsMigrated = rowsMigrated;
    }

    public int getBatchesCompleted() {
        return batchesCompleted;
    }

    public void setBatchesCompleted(int batchesCompleted) {
        this.batchesCompleted = batchesCompleted;
    }

    public String getLastWatermark() {
        return lastWatermark;
    }

    public void setLastWatermark(String lastWatermark) {
        this.lastWatermark = lastWatermark;
    }

    public String getLastSeekKey() {
        return lastSeekKey;
    }

    public void setLastSeekKey(String lastSeekKey) {
        this.lastSeekKey = lastSeekKey;
    }

    public String getRequestFingerprint() {
        return requestFingerprint;
    }

    public void setRequestFingerprint(String requestFingerprint) {
        this.requestFingerprint = requestFingerprint;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
