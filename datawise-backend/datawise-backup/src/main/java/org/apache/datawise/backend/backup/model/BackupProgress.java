package org.apache.datawise.backend.backup.model;

public class BackupProgress {

    private String phase;
    private int current;
    private int total;

    public BackupProgress() {
    }

    public BackupProgress(String phase, int current, int total) {
        this.phase = phase;
        this.current = current;
        this.total = total;
    }

    public String getPhase() {
        return phase;
    }

    public void setPhase(String phase) {
        this.phase = phase;
    }

    public int getCurrent() {
        return current;
    }

    public void setCurrent(int current) {
        this.current = current;
    }

    public int getTotal() {
        return total;
    }

    public void setTotal(int total) {
        this.total = total;
    }
}
