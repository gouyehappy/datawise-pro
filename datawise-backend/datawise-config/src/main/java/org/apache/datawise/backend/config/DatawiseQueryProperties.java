package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "datawise.query")
public class DatawiseQueryProperties {

    /**
     * 服务端默认最大返回行数；0 表示「不设默认上限」，仍会受 {@link #absoluteMaxResultRows} 约束。
     * 默认 10000。
     */
    private int maxResultRows = 10_000;

    /**
     * Absolute heap-safety ceiling for interactive SQL materialization.
     * Applied even when {@link #maxResultRows} is 0 (legacy "unlimited").
     * Set to 0 only for deliberate local debugging.
     */
    private int absoluteMaxResultRows = 100_000;

    /**
     * JDBC {@link java.sql.Statement#setQueryTimeout(int)}；0 表示不限制（保持兼容）。
     */
    private int timeoutSeconds = 0;

    /**
     * Max concurrent interactive SQL executions process-wide；0 = unlimited.
     * Covers console execute + cursor page fetches.
     */
    private int maxConcurrentGlobal = 64;

    /**
     * Max concurrent interactive SQL executions per authenticated user；0 = unlimited.
     */
    private int maxConcurrentPerUser = 8;

    /**
     * Maximum OFFSET allowed for interactive cursor / table page fetches.
     * Deep OFFSET forces the database to skip many rows; prefer narrower WHERE filters.
     * {@code 0} disables the guard (not recommended).
     */
    private int maxCursorOffset = 100_000;

    public int getMaxResultRows() {
        return maxResultRows;
    }

    public void setMaxResultRows(int maxResultRows) {
        this.maxResultRows = Math.max(0, maxResultRows);
    }

    public int getAbsoluteMaxResultRows() {
        return absoluteMaxResultRows;
    }

    public void setAbsoluteMaxResultRows(int absoluteMaxResultRows) {
        this.absoluteMaxResultRows = Math.max(0, absoluteMaxResultRows);
    }

    public int getTimeoutSeconds() {
        return timeoutSeconds;
    }

    public void setTimeoutSeconds(int timeoutSeconds) {
        this.timeoutSeconds = Math.max(0, timeoutSeconds);
    }

    public int getMaxConcurrentGlobal() {
        return maxConcurrentGlobal;
    }

    public void setMaxConcurrentGlobal(int maxConcurrentGlobal) {
        this.maxConcurrentGlobal = Math.max(0, maxConcurrentGlobal);
    }

    public int getMaxConcurrentPerUser() {
        return maxConcurrentPerUser;
    }

    public void setMaxConcurrentPerUser(int maxConcurrentPerUser) {
        this.maxConcurrentPerUser = Math.max(0, maxConcurrentPerUser);
    }

    public int getMaxCursorOffset() {
        return maxCursorOffset;
    }

    public void setMaxCursorOffset(int maxCursorOffset) {
        this.maxCursorOffset = Math.max(0, maxCursorOffset);
    }
}
