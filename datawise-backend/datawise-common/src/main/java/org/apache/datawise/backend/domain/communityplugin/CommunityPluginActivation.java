package org.apache.datawise.backend.domain.communityplugin;

/**
 * One activation record under {@code <plugin>/activations/<seq>.json}.
 */
public record CommunityPluginActivation(
        long sequence,
        String version,
        String previousVersion,
        String packageSha256,
        String activatedAt) {
}
