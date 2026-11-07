package org.apache.datawise.backend.domain.communityplugin;

public record CommunityPluginBackendEntrypoint(
        String executable,
        String transport) {

    public CommunityPluginBackendEntrypoint {
        if (transport == null || transport.isBlank()) {
            transport = "stdio-jsonl";
        }
    }
}
