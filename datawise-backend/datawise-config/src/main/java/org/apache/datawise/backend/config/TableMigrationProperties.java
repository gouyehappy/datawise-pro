package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "datawise.migration")
public class TableMigrationProperties {

    private int defaultBatchSize = 500;
    private int maxBatchTables = 50;
    private boolean continueOnTableFailure = true;
    /** Per-table attempts including the first try; transient JDBC errors only. */
    private int tableRetryAttempts = 2;
    /** Prefetch next SELECT page on a dedicated source connection while inserting the current batch. */
    private boolean pipelineReadAhead = true;
    /** Persist migration checkpoint to disk every N committed batches (1 = every batch). */
    private int checkpointPersistEveryBatches = 1;
    /** Worker threads for async migration jobs in this JVM. */
    private int migrationJobThreads = 4;
    /** Route async migration jobs through task-concurrency slot pool. */
    private boolean taskConcurrencyEnabled = true;
    /** Default allocated slots per user tenant when first enqueuing a migration job. */
    private int taskConcurrencyTenantSlots = 2;

    public int getDefaultBatchSize() {
        return defaultBatchSize;
    }

    public void setDefaultBatchSize(int defaultBatchSize) {
        this.defaultBatchSize = Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, defaultBatchSize));
    }

    public int getMaxBatchTables() {
        return maxBatchTables;
    }

    public void setMaxBatchTables(int maxBatchTables) {
        this.maxBatchTables = Math.max(1, maxBatchTables);
    }

    public boolean isContinueOnTableFailure() {
        return continueOnTableFailure;
    }

    public void setContinueOnTableFailure(boolean continueOnTableFailure) {
        this.continueOnTableFailure = continueOnTableFailure;
    }

    public int getTableRetryAttempts() {
        return tableRetryAttempts;
    }

    public void setTableRetryAttempts(int tableRetryAttempts) {
        this.tableRetryAttempts = Math.max(1, tableRetryAttempts);
    }

    public boolean isPipelineReadAhead() {
        return pipelineReadAhead;
    }

    public void setPipelineReadAhead(boolean pipelineReadAhead) {
        this.pipelineReadAhead = pipelineReadAhead;
    }

    public int getCheckpointPersistEveryBatches() {
        return checkpointPersistEveryBatches;
    }

    public void setCheckpointPersistEveryBatches(int checkpointPersistEveryBatches) {
        this.checkpointPersistEveryBatches = Math.max(1, checkpointPersistEveryBatches);
    }

    public int getMigrationJobThreads() {
        return migrationJobThreads;
    }

    public void setMigrationJobThreads(int migrationJobThreads) {
        this.migrationJobThreads = Math.max(1, migrationJobThreads);
    }

    public boolean isTaskConcurrencyEnabled() {
        return taskConcurrencyEnabled;
    }

    public void setTaskConcurrencyEnabled(boolean taskConcurrencyEnabled) {
        this.taskConcurrencyEnabled = taskConcurrencyEnabled;
    }

    public int getTaskConcurrencyTenantSlots() {
        return taskConcurrencyTenantSlots;
    }

    public void setTaskConcurrencyTenantSlots(int taskConcurrencyTenantSlots) {
        this.taskConcurrencyTenantSlots = Math.max(1, taskConcurrencyTenantSlots);
    }

    private static final int MIN_BATCH_SIZE = 50;
    private static final int MAX_BATCH_SIZE = 5000;
}
