package org.apache.datawise.backend.jdbc.ssh;

/**
 * Serializes reads/writes to {@code ssh-known-hosts} across interactive SSH and JDBC tunnels.
 */
public final class SshKnownHostsFileLock {

    public static final Object LOCK = new Object();

    private SshKnownHostsFileLock() {
    }
}
