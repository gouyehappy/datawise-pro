package org.apache.datawise.pack.aioffline;

/** Lightweight health probe registered by the Offline AI sample module. */
public final class PackAiOfflineHealthProbe {

    public String status() {
        return "ok";
    }

    public String delivery() {
        return "offline";
    }
}
