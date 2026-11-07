package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Community plugin (.dwp) install policy.
 */
@ConfigurationProperties(prefix = "datawise.community-plugin")
public class CommunityPluginProperties {

    /**
     * When true, install endpoints may accept unsigned development packages.
     * Must be set on the server — request parameters cannot enable this alone.
     * Production must keep this {@code false}.
     */
    private boolean allowUnsigned = false;

    public boolean isAllowUnsigned() {
        return allowUnsigned;
    }

    public void setAllowUnsigned(boolean allowUnsigned) {
        this.allowUnsigned = allowUnsigned;
    }
}
