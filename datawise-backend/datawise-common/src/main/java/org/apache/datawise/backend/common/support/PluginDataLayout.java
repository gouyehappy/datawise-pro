package org.apache.datawise.backend.common.support;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/**
 * Plugin persistence lives under the host workspace, never under a hard-coded
 * folder name and never under the OS user-config directory.
 */
public final class PluginDataLayout {

    /** Relative to {@link WorkspaceRoot}, not a sibling of a folder named config. */
    public static final String DIRECTORY = "community-plugin-data";

    public static final String CONNECTOR_SSH_ID = "io.datawise.connector.ssh";

    private PluginDataLayout() {
    }

    public static Path pluginDir(Path workspaceRoot, String pluginId) {
        return workspaceRoot.resolve(DIRECTORY).resolve(pluginId);
    }

    /**
     * Connector SSH host-key file. Migrates a previous file that sat directly
     * in the workspace ({@code ssh-known-hosts}).
     */
    public static Path connectorSshKnownHosts(Path workspaceRoot) {
        Path target = pluginDir(workspaceRoot, CONNECTOR_SSH_ID).resolve("known_hosts");
        Path legacy = workspaceRoot.resolve("ssh-known-hosts");
        if (!Files.isRegularFile(target) && Files.isRegularFile(legacy)) {
            try {
                Files.createDirectories(target.getParent());
                Files.move(legacy, target, StandardCopyOption.ATOMIC_MOVE);
            } catch (IOException atomicFailed) {
                try {
                    Files.createDirectories(target.getParent());
                    Files.move(legacy, target, StandardCopyOption.REPLACE_EXISTING);
                } catch (IOException ignored) {
                    return legacy;
                }
            }
        }
        return target;
    }
}
