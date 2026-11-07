package org.apache.datawise.pack.dataops;

public final class PackDataopsHealthProbe {

    public String status() {
        return "ok";
    }

    public String packId() {
        return "pack.dataops";
    }
}
