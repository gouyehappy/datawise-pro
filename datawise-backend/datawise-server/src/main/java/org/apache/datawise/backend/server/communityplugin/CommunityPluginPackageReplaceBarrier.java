package org.apache.datawise.backend.server.communityplugin;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks plugin ids whose package directory is being replaced.
 * Stops sidecars via {@link CommunityPluginSidecarLifecycle} (late lookup)
 * so {@link CommunityPluginInstaller} need not inject {@link CommunityPluginHost}.
 */
@Component
public class CommunityPluginPackageReplaceBarrier {

    private final Set<String> installingIds = ConcurrentHashMap.newKeySet();
    private final ObjectProvider<CommunityPluginSidecarLifecycle> sidecarLifecycle;

    public CommunityPluginPackageReplaceBarrier(
            ObjectProvider<CommunityPluginSidecarLifecycle> sidecarLifecycle
    ) {
        this.sidecarLifecycle = sidecarLifecycle;
    }

    public boolean isInstalling(String pluginId) {
        return pluginId != null && installingIds.contains(pluginId);
    }

    /**
     * Blocks {@link CommunityPluginHost#activate(String)} and stops any running
     * sidecar so Windows can release the {@code .exe} lock mid-swap.
     */
    public void begin(String pluginId) {
        if (pluginId == null || pluginId.isBlank()) {
            return;
        }
        installingIds.add(pluginId);
        CommunityPluginSidecarLifecycle lifecycle = sidecarLifecycle.getIfAvailable();
        if (lifecycle != null) {
            lifecycle.stopSidecar(pluginId);
        }
    }

    public void end(String pluginId) {
        if (pluginId == null || pluginId.isBlank()) {
            return;
        }
        installingIds.remove(pluginId);
    }
}
