package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

/**
 * Remote connector JAR download policy (marketplace install).
 */
@ConfigurationProperties(prefix = "datawise.connector.download")
public class ConnectorDownloadProperties {

    /**
     * When true, only {@code https} is allowed except loopback {@code http} for local/dev tests.
     */
    private boolean requireHttps = true;

    /**
     * When non-empty, download host must match one of these (case-insensitive).
     * Empty = any host (still subject to HTTPS / loopback rules).
     */
    private List<String> allowedHosts = new ArrayList<>();

    public boolean isRequireHttps() {
        return requireHttps;
    }

    public void setRequireHttps(boolean requireHttps) {
        this.requireHttps = requireHttps;
    }

    public List<String> getAllowedHosts() {
        return allowedHosts;
    }

    public void setAllowedHosts(List<String> allowedHosts) {
        this.allowedHosts = allowedHosts != null ? allowedHosts : new ArrayList<>();
    }
}
