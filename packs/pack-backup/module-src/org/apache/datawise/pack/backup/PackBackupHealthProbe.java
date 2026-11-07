package org.apache.datawise.pack.backup;

public final class PackBackupHealthProbe {

    public String status() {
        return "ok";
    }

    public String packId() {
        return "pack.backup";
    }
}
