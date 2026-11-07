package org.apache.datawise.backend.backup.model;

import java.time.Instant;

public class BackupPolicy {

    public static final String TYPE_WORKBENCH = "workbench";
    public static final String TYPE_DATABASE = "database";

    private String id;
    private String name;
    private String type = TYPE_WORKBENCH;
    private boolean enabled = true;
    private String cronExpression;
    private String destinationRoot;
    private BackupRetentionSpec retention = new BackupRetentionSpec();
    private boolean notifyOnFailure = true;
    private boolean notifyOnSuccess = false;
    private String encryption = "none";

    private boolean includePlugins;
    private boolean includeDrivers;
    private boolean includeSqlHistory = true;

    private String connectionId;
    private String database;
    private String contentMode = "structureAndData";
    private java.util.List<String> tableInclude;
    private java.util.List<String> tableExclude;

    private Instant createdAt;
    private Instant updatedAt;
    private Long createdBy;

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

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getCronExpression() {
        return cronExpression;
    }

    public void setCronExpression(String cronExpression) {
        this.cronExpression = cronExpression;
    }

    public String getDestinationRoot() {
        return destinationRoot;
    }

    public void setDestinationRoot(String destinationRoot) {
        this.destinationRoot = destinationRoot;
    }

    public BackupRetentionSpec getRetention() {
        return retention;
    }

    public void setRetention(BackupRetentionSpec retention) {
        this.retention = retention != null ? retention : new BackupRetentionSpec();
    }

    public boolean isNotifyOnFailure() {
        return notifyOnFailure;
    }

    public void setNotifyOnFailure(boolean notifyOnFailure) {
        this.notifyOnFailure = notifyOnFailure;
    }

    public boolean isNotifyOnSuccess() {
        return notifyOnSuccess;
    }

    public void setNotifyOnSuccess(boolean notifyOnSuccess) {
        this.notifyOnSuccess = notifyOnSuccess;
    }

    public String getEncryption() {
        return encryption;
    }

    public void setEncryption(String encryption) {
        this.encryption = encryption;
    }

    public boolean isIncludePlugins() {
        return includePlugins;
    }

    public void setIncludePlugins(boolean includePlugins) {
        this.includePlugins = includePlugins;
    }

    public boolean isIncludeDrivers() {
        return includeDrivers;
    }

    public void setIncludeDrivers(boolean includeDrivers) {
        this.includeDrivers = includeDrivers;
    }

    public boolean isIncludeSqlHistory() {
        return includeSqlHistory;
    }

    public void setIncludeSqlHistory(boolean includeSqlHistory) {
        this.includeSqlHistory = includeSqlHistory;
    }

    public String getConnectionId() {
        return connectionId;
    }

    public void setConnectionId(String connectionId) {
        this.connectionId = connectionId;
    }

    public String getDatabase() {
        return database;
    }

    public void setDatabase(String database) {
        this.database = database;
    }

    public String getContentMode() {
        return contentMode;
    }

    public void setContentMode(String contentMode) {
        this.contentMode = contentMode;
    }

    public java.util.List<String> getTableInclude() {
        return tableInclude;
    }

    public void setTableInclude(java.util.List<String> tableInclude) {
        this.tableInclude = tableInclude;
    }

    public java.util.List<String> getTableExclude() {
        return tableExclude;
    }

    public void setTableExclude(java.util.List<String> tableExclude) {
        this.tableExclude = tableExclude;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public Long getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(Long createdBy) {
        this.createdBy = createdBy;
    }
}
