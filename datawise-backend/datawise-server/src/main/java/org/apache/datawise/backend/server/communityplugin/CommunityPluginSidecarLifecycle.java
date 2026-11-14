package org.apache.datawise.backend.server.communityplugin;

/**
 * Narrow stop hook used by {@link CommunityPluginPackageReplaceBarrier}
 * so the installer does not depend on {@link CommunityPluginHost}.
 */
@FunctionalInterface
public interface CommunityPluginSidecarLifecycle {

    /** Stop a running sidecar session if present (no-op when idle). */
    void stopSidecar(String pluginId);
}
