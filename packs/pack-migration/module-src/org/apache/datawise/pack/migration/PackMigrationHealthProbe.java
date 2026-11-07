package org.apache.datawise.pack.migration;

public final class PackMigrationHealthProbe {

    public String status() {
        return "ok";
    }

    public String packId() {
        return "pack.migration";
    }

    public int trialMaxRowsPerTable() {
        return 1000;
    }
}
