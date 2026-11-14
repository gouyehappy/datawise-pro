package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Cloud multi-replica affinity posture ({@code datawise.deployment.*}).
 * Console SQL sessions/cursors and AI analysis SSE remain process-local — see docs/DEPLOYMENT.md#affinity.
 */
@ConfigurationProperties(prefix = "datawise.deployment")
public class DeploymentAffinityProperties {

    public enum AffinityMode {
        /** Multi-replica with sticky load-balancing for process-local state. */
        STICKY,
        /** Single replica — sticky not required. */
        SINGLE
    }

    /** Default sticky so cloud operators must opt into single-replica explicitly. */
    private AffinityMode affinityMode = AffinityMode.STICKY;

    public AffinityMode getAffinityMode() {
        return affinityMode;
    }

    public void setAffinityMode(AffinityMode affinityMode) {
        this.affinityMode = affinityMode != null ? affinityMode : AffinityMode.STICKY;
    }

    public boolean stickyRequired() {
        return affinityMode == AffinityMode.STICKY;
    }
}
