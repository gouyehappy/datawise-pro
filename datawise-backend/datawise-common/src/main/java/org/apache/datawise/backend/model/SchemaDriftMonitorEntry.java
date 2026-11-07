package org.apache.datawise.backend.model;

import java.time.Instant;

/**
 * Schema 漂移监控任务（config/users/{id}/schema-drift-monitors.json）。
 */
public class SchemaDriftMonitorEntry {

    private String id;
    private String name;
    private String sourceConnectionId;
    private String sourceDatabase;
    private String targetConnectionId;
    private String targetDatabase;
    private String tablePattern;
    private boolean enabled = true;
    private Instant lastCheckedAt;
    private String lastReportJson;
    private int driftCount;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getSourceConnectionId() {
        return sourceConnectionId;
    }

    public void setSourceConnectionId(String sourceConnectionId) {
        this.sourceConnectionId = sourceConnectionId;
    }

    public String getSourceDatabase() {
        return sourceDatabase;
    }

    public void setSourceDatabase(String sourceDatabase) {
        this.sourceDatabase = sourceDatabase;
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

    public String getTablePattern() {
        return tablePattern;
    }

    public void setTablePattern(String tablePattern) {
        this.tablePattern = tablePattern;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public Instant getLastCheckedAt() {
        return lastCheckedAt;
    }

    public void setLastCheckedAt(Instant lastCheckedAt) {
        this.lastCheckedAt = lastCheckedAt;
    }

    public String getLastReportJson() {
        return lastReportJson;
    }

    public void setLastReportJson(String lastReportJson) {
        this.lastReportJson = lastReportJson;
    }

    public int getDriftCount() {
        return driftCount;
    }

    public void setDriftCount(int driftCount) {
        this.driftCount = driftCount;
    }
}
