package org.apache.datawise.backend.domain.communityplugin;

public record CommunityPluginEntrypoints(
        CommunityPluginBackendEntrypoint backend,
        CommunityPluginUiEntrypoint ui) {
}
