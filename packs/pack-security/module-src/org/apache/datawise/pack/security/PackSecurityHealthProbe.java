package org.apache.datawise.pack.security;

public final class PackSecurityHealthProbe {

    public String status() {
        return "ok";
    }

    public String packId() {
        return "pack.security";
    }
}
