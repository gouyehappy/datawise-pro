package org.apache.datawise.backend.backup.model;

public class BackupRetentionSpec {

    private Integer maxCount;
    private Integer maxAgeDays;
    private Long maxTotalBytes;

    public Integer getMaxCount() {
        return maxCount;
    }

    public void setMaxCount(Integer maxCount) {
        this.maxCount = maxCount;
    }

    public Integer getMaxAgeDays() {
        return maxAgeDays;
    }

    public void setMaxAgeDays(Integer maxAgeDays) {
        this.maxAgeDays = maxAgeDays;
    }

    public Long getMaxTotalBytes() {
        return maxTotalBytes;
    }

    public void setMaxTotalBytes(Long maxTotalBytes) {
        this.maxTotalBytes = maxTotalBytes;
    }
}
