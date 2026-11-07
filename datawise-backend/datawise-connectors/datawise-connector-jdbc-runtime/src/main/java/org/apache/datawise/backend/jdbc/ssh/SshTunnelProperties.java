package org.apache.datawise.backend.jdbc.ssh;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "datawise.ssh")
public class SshTunnelProperties {

    /**
     * When true, verify SSH host keys against {@link #knownHostsPath}. Unknown keys fail unless
     * {@link #acceptNewHostKeys} is enabled.
     */
    private boolean strictHostKeyChecking = true;

    /**
     * Persist newly seen host keys (OpenSSH {@code accept-new} semantics). Ignored when
     * {@link #strictHostKeyChecking} is false.
     */
    private boolean acceptNewHostKeys = true;

    /** Optional override; default resolves under the DataWise config directory. */
    private String knownHostsPath;

    /** Close SSH tunnels that have been idle longer than {@link #idleTtlMinutes}. Zero disables eviction. */
    private int idleTtlMinutes = 30;

    public int getIdleTtlMinutes() {
        return idleTtlMinutes;
    }

    public void setIdleTtlMinutes(int idleTtlMinutes) {
        this.idleTtlMinutes = Math.max(0, idleTtlMinutes);
    }

    public boolean isStrictHostKeyChecking() {
        return strictHostKeyChecking;
    }

    public void setStrictHostKeyChecking(boolean strictHostKeyChecking) {
        this.strictHostKeyChecking = strictHostKeyChecking;
    }

    public boolean isAcceptNewHostKeys() {
        return acceptNewHostKeys;
    }

    public void setAcceptNewHostKeys(boolean acceptNewHostKeys) {
        this.acceptNewHostKeys = acceptNewHostKeys;
    }

    public String getKnownHostsPath() {
        return knownHostsPath;
    }

    public void setKnownHostsPath(String knownHostsPath) {
        this.knownHostsPath = knownHostsPath != null ? knownHostsPath.trim() : null;
    }
}
