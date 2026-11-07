package org.apache.datawise.backend.domain.communityplugin;

public record CommunityPluginInstallRequest(
        String path,
        Boolean allowUnsigned) {
}
