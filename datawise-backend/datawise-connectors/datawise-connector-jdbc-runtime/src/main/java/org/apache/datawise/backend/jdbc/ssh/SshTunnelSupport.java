package org.apache.datawise.backend.jdbc.ssh;

import org.apache.datawise.backend.common.support.SecretMaterialDigest;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.Locale;

public final class SshTunnelSupport {

    private SshTunnelSupport() {
    }

    public static boolean isEnabled(ConnectionEntity entity) {
        return entity != null && entity.isSshEnabled();
    }

    public static void validate(ConnectionEntity entity) throws SshTunnelException {
        if (entity == null || !entity.isSshEnabled()) {
            return;
        }
        if (isBlank(entity.getSshHost())) {
            throw new SshTunnelException("SSH host is required when SSH tunnel is enabled");
        }
        if (isBlank(entity.getSshUser())) {
            throw new SshTunnelException("SSH username is required when SSH tunnel is enabled");
        }
        if (isBlank(entity.getSshPassword()) && isBlank(entity.getSshPrivateKey())) {
            throw new SshTunnelException("SSH password or private key is required when SSH tunnel is enabled");
        }
        if (isBlank(entity.getHost())) {
            throw new SshTunnelException("Database host is required when SSH tunnel is enabled");
        }
    }

    public static int sshPort(ConnectionEntity entity) {
        if (entity == null || isBlank(entity.getSshPort())) {
            return 22;
        }
        try {
            int port = Integer.parseInt(entity.getSshPort().trim());
            return port > 0 && port <= 65535 ? port : 22;
        } catch (NumberFormatException ex) {
            return 22;
        }
    }

    /** 连接未填端口时回退 {@code defaultPort}（调用方传 {@code DbType.getPort()}）。 */
    public static int remoteDbPort(ConnectionEntity entity, int defaultPort) {
        if (entity != null && !isBlank(entity.getPort())) {
            try {
                return Integer.parseInt(entity.getPort().trim());
            } catch (NumberFormatException ignored) {
                // fall through
            }
        }
        return defaultPort;
    }

    public static String fingerprint(ConnectionEntity entity, int remotePort) {
        return String.join("|",
                nullToEmpty(entity.getId()),
                nullToEmpty(entity.getSshHost()),
                String.valueOf(sshPort(entity)),
                nullToEmpty(entity.getSshUser()),
                SecretMaterialDigest.sha256Hex(nullToEmpty(entity.getSshPassword())),
                SecretMaterialDigest.sha256Hex(nullToEmpty(entity.getSshPrivateKey())),
                SecretMaterialDigest.sha256Hex(nullToEmpty(entity.getSshPassphrase())),
                nullToEmpty(entity.getHost()),
                String.valueOf(remotePort),
                nullToEmpty(entity.getJdbcUrl())
        );
    }

    public static String toUserMessage(Throwable error) {
        String message = rootMessage(error);
        if (message == null || message.isBlank()) {
            return "SSH tunnel failed";
        }
        String lower = message.toLowerCase(Locale.ROOT);
        if (lower.contains("auth fail") || lower.contains("authentication")) {
            return "SSH authentication failed. Check SSH username, password, or private key.";
        }
        if (lower.contains("connection refused") || lower.contains("connect timed out")) {
            return "Cannot reach SSH bastion. Check SSH host, port, firewall, and VPN. Details: " + message;
        }
        if (lower.contains("unknownhost") || lower.contains("unknown host")) {
            return "SSH host could not be resolved. Check the SSH hostname. Details: " + message;
        }
        return "SSH tunnel failed: " + message;
    }

    private static String rootMessage(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current.getMessage() != null && !current.getMessage().isBlank()) {
                return current.getMessage();
            }
            current = current.getCause();
        }
        return null;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String nullToEmpty(String value) {
        return value != null ? value : "";
    }
}
