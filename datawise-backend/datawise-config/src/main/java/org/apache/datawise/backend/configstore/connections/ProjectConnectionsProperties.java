package org.apache.datawise.backend.configstore.connections;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Project connection layout options (PW-3-04).
 */
@ConfigurationProperties(prefix = "datawise.projects")
public class ProjectConnectionsProperties {

    /**
     * When true (file storage backend), persist connections under
     * {@code tenants/{tid}/projects/{pid}/connections.xml} and merge on read.
     * Default false keeps legacy unified {@code tenants/{tid}/connections.xml}.
     */
    private boolean splitConnections = false;

    public boolean isSplitConnections() {
        return splitConnections;
    }

    public void setSplitConnections(boolean splitConnections) {
        this.splitConnections = splitConnections;
    }
}
