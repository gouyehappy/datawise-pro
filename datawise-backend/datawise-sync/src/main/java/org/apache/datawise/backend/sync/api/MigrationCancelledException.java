package org.apache.datawise.backend.sync.api;

/** 迁移执行在批次边界被用户取消（不可断点续传）。 */
public class MigrationCancelledException extends MigrationPausedException {

    public MigrationCancelledException(String jobId) {
        super(jobId);
    }

    @Override
    public String getMessage() {
        return "Migration job cancelled: " + getJobId();
    }
}
