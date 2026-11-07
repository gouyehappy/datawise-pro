package org.apache.datawise.backend.domain.communityplugin;

/**
 * Install verification policy for {@code .dwp} packages.
 */
public enum CommunityPluginInstallPolicy {
    /** Require a trusted Ed25519 signature. */
    SIGNED,
    /** Allow missing signature (developer toggle only). */
    DEVELOPMENT
}
