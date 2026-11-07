package org.apache.datawise.backend.domain.communityplugin;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Trusted Ed25519 public key entry stored under {@code config/community-plugins/.trust/keys.json}.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CommunityPluginTrustKey(
        String id,
        String label,
        String publicKeyBase64) {
}
