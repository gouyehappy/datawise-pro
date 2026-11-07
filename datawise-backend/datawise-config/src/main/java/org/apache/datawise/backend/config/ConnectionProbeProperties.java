package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Controls SSRF-style guards on ad-hoc connection test probes
 * ({@code POST /api/connections/test}).
 */
@ConfigurationProperties(prefix = "datawise.security.connection-probe")
public class ConnectionProbeProperties {

    /**
     * When {@code true} (default), registered users may test connections to RFC1918 /
     * link-local hosts such as {@code 10.x.x.x}. Set to {@code false} only on
     * internet-exposed deployments where probe SSRF must be blocked.
     */
    private boolean allowPrivateNetworks = false;

    public boolean isAllowPrivateNetworks() {
        return allowPrivateNetworks;
    }

    public void setAllowPrivateNetworks(boolean allowPrivateNetworks) {
        this.allowPrivateNetworks = allowPrivateNetworks;
    }
}
