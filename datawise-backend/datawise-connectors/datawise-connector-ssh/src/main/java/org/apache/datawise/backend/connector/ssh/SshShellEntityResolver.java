package org.apache.datawise.backend.connector.ssh;

import org.apache.datawise.backend.jdbc.ssh.SshPrivateKeySupport;
import org.apache.datawise.backend.model.ConnectionEntity;

/**
 * Resolves a {@link ConnectionEntity} for interactive SSH shell sessions.
 * Supports native SSH connections and JDBC connections with SSH tunnel enabled.
 */
public final class SshShellEntityResolver {

    private SshShellEntityResolver() {
    }

    public static boolean supportsInteractiveShell(ConnectionEntity entity) {
        if (entity == null) {
            return false;
        }
        if (isNativeSsh(entity)) {
            return true;
        }
        return entity.isSshEnabled();
    }

    public static ConnectionEntity resolveForShell(ConnectionEntity source) throws SshConnectionException {
        if (source == null) {
            throw new SshConnectionException("Connection is required");
        }
        if (isNativeSsh(source)) {
            return source;
        }
        if (!source.isSshEnabled()) {
            throw new SshConnectionException("SSH tunnel is not enabled for this connection");
        }
        validateTunnelCredentials(source);
        ConnectionEntity mapped = new ConnectionEntity();
        mapped.setId(source.getId());
        mapped.setHost(required(source.getSshHost(), "SSH host is required when SSH tunnel is enabled"));
        mapped.setPort(normalizePort(source.getSshPort()));
        mapped.setUsername(required(source.getSshUser(), "SSH username is required when SSH tunnel is enabled"));
        mapped.setPassword(source.getSshPassword());
        mapped.setSshPrivateKey(source.getSshPrivateKey());
        mapped.setSshPassphrase(source.getSshPassphrase());
        return mapped;
    }

    private static boolean isNativeSsh(ConnectionEntity entity) {
        return entity.getDbType() != null && "ssh".equalsIgnoreCase(entity.getDbType());
    }

    private static void validateTunnelCredentials(ConnectionEntity entity) throws SshConnectionException {
        required(entity.getSshHost(), "SSH host is required when SSH tunnel is enabled");
        required(entity.getSshUser(), "SSH username is required when SSH tunnel is enabled");
        boolean hasPassword = entity.getSshPassword() != null && !entity.getSshPassword().isBlank();
        boolean hasKey = SshPrivateKeySupport.looksLikePemPrivateKey(entity.getSshPrivateKey());
        if (!hasPassword && !hasKey) {
            throw new SshConnectionException("SSH password or private key is required when SSH tunnel is enabled");
        }
    }

    private static String required(String value, String message) throws SshConnectionException {
        if (value == null || value.isBlank()) {
            throw new SshConnectionException(message);
        }
        return value.trim();
    }

    private static String normalizePort(String sshPort) {
        if (sshPort == null || sshPort.isBlank()) {
            return "22";
        }
        return sshPort.trim();
    }
}
