package org.apache.datawise.pack.ai;

/** Lightweight health marker registered by {@link PackAiModuleContributor}. */
public final class PackAiHealthProbe {

    public String status() {
        return "ok";
    }

    public String packId() {
        return "pack.ai";
    }
}
