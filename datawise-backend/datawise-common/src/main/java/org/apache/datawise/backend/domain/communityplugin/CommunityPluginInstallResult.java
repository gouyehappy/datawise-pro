package org.apache.datawise.backend.domain.communityplugin;

import java.nio.file.Path;

public record CommunityPluginInstallResult(
        InstalledCommunityPlugin plugin,
        String previousVersion,
        String packageSha256,
        boolean signed) {

    public Path path() {
        return plugin.path();
    }
}
