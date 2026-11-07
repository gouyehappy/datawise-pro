package org.apache.datawise.backend.backup.model;

import java.util.ArrayList;
import java.util.List;

/** Aggregate + per-table stats written beside the artifact ({@code stats.json}). */
public class BackupStatsDocument {

    public static final String LAYOUT_PER_TABLE = "per_table";
    public static final String LAYOUT_SINGLE_FILE = "single_file";

    private String layout = LAYOUT_PER_TABLE;
    private int tableCount;
    private int successTables;
    private int failedTables;
    private long totalRows;
    private long totalBytes;
    private long durationMs;
    private int parallelism;
    private List<BackupTableStat> tables = new ArrayList<>();

    public String getLayout() {
        return layout;
    }

    public void setLayout(String layout) {
        this.layout = layout;
    }

    public int getTableCount() {
        return tableCount;
    }

    public void setTableCount(int tableCount) {
        this.tableCount = tableCount;
    }

    public int getSuccessTables() {
        return successTables;
    }

    public void setSuccessTables(int successTables) {
        this.successTables = successTables;
    }

    public int getFailedTables() {
        return failedTables;
    }

    public void setFailedTables(int failedTables) {
        this.failedTables = failedTables;
    }

    public long getTotalRows() {
        return totalRows;
    }

    public void setTotalRows(long totalRows) {
        this.totalRows = totalRows;
    }

    public long getTotalBytes() {
        return totalBytes;
    }

    public void setTotalBytes(long totalBytes) {
        this.totalBytes = totalBytes;
    }

    public long getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(long durationMs) {
        this.durationMs = durationMs;
    }

    public int getParallelism() {
        return parallelism;
    }

    public void setParallelism(int parallelism) {
        this.parallelism = parallelism;
    }

    public List<BackupTableStat> getTables() {
        return tables;
    }

    public void setTables(List<BackupTableStat> tables) {
        this.tables = tables != null ? tables : new ArrayList<>();
    }
}
