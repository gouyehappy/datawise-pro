package org.apache.datawise.backend.sync.api;

/** 迁移执行在批次边界被用户暂停。 */
public class MigrationPausedException extends RuntimeException {

    private final String jobId;

    public MigrationPausedException(String jobId) {
        super("Migration job paused: " + jobId);
        this.jobId = jobId;
    }

    public String getJobId() {
        return jobId;
    }
}
