package org.apache.datawise.backend.connector.ssh;

import org.apache.datawise.backend.jdbc.ssh.SshPrivateKeySupport;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.Locale;

public final class SshConnectionSupport {

    private static final int DEFAULT_PORT = 22;

    private SshConnectionSupport() {
    }

    public static void validate(ConnectionEntity entity) throws SshConnectionException {
        if (entity == null) {
            throw new SshConnectionException("Connection is required");
        }
        if (isBlank(entity.getHost())) {
            throw new SshConnectionException("SSH host is required");
        }
        if (isBlank(entity.getUsername())) {
            throw new SshConnectionException("SSH username is required");
        }
        boolean hasPassword = !isBlank(entity.getPassword());
        boolean hasPrivateKey = SshPrivateKeySupport.looksLikePemPrivateKey(entity.getSshPrivateKey());
        if (!hasPassword && !hasPrivateKey) {
            throw new SshConnectionException("SSH password or private key is required");
        }
        if (isJumpEnabled(entity)) {
            validateJump(entity);
        }
    }

    /** Native SSH jump: {@code sshEnabled} + jump host fields (not JDBC tunnel mapping). */
    public static boolean isJumpEnabled(ConnectionEntity entity) {
        return entity != null
                && entity.isSshEnabled()
                && !isBlank(entity.getSshHost());
    }

    public static void validateJump(ConnectionEntity entity) throws SshConnectionException {
        if (entity == null || !entity.isSshEnabled()) {
            return;
        }
        if (isBlank(entity.getSshHost())) {
            throw new SshConnectionException("Jump host is required when jump is enabled");
        }
        if (isBlank(entity.getSshUser())) {
            throw new SshConnectionException("Jump username is required when jump is enabled");
        }
        boolean hasPassword = !isBlank(entity.getSshPassword());
        boolean hasPrivateKey = SshPrivateKeySupport.looksLikePemPrivateKey(entity.getJumpPrivateKey());
        if (!hasPassword && !hasPrivateKey) {
            throw new SshConnectionException("Jump password or private key is required when jump is enabled");
        }
    }

    public static int jumpPort(ConnectionEntity entity) {
        if (entity == null || isBlank(entity.getSshPort())) {
            return DEFAULT_PORT;
        }
        try {
            int port = Integer.parseInt(entity.getSshPort().trim());
            return port > 0 && port <= 65535 ? port : DEFAULT_PORT;
        } catch (NumberFormatException ex) {
            return DEFAULT_PORT;
        }
    }

    public static int sshPort(ConnectionEntity entity) {
        if (entity == null || isBlank(entity.getPort())) {
            return DEFAULT_PORT;
        }
        try {
            int port = Integer.parseInt(entity.getPort().trim());
            return port > 0 && port <= 65535 ? port : DEFAULT_PORT;
        } catch (NumberFormatException ex) {
            return DEFAULT_PORT;
        }
    }

    public static String describeCredentials(ConnectionEntity entity) {
        if (entity == null) {
            return "credentials=unknown";
        }
        String username = entity.getUsername() != null ? entity.getUsername().trim() : "";
        boolean hasPassword = entity.getPassword() != null && !entity.getPassword().isBlank();
        int passwordLength = hasPassword ? entity.getPassword().trim().length() : 0;
        boolean hasPrivateKey = SshPrivateKeySupport.looksLikePemPrivateKey(entity.getSshPrivateKey());
        boolean ignoredKeyText = !hasPrivateKey
                && entity.getSshPrivateKey() != null
                && !entity.getSshPrivateKey().isBlank();
        StringBuilder summary = new StringBuilder("username='")
                .append(username)
                .append("', password=")
                .append(hasPassword ? "yes (" + passwordLength + " chars)" : "missing")
                .append(", privateKey=")
                .append(hasPrivateKey ? "yes" : "no");
        if (ignoredKeyText) {
            summary.append(" (ignored non-PEM text in private-key field)");
        }
        return summary.toString();
    }

    public static boolean isAuthFailure(Throwable error) {
        String message = rootMessage(error);
        if (message == null || message.isBlank()) {
            return false;
        }
        String lower = message.toLowerCase(Locale.ROOT);
        return lower.contains("auth fail") || lower.contains("authentication");
    }

    public static boolean isTransientConnectFailure(Throwable error) {
        String message = rootMessage(error);
        if (message == null || message.isBlank()) {
            return false;
        }
        String lower = message.toLowerCase(Locale.ROOT);
        if (lower.contains("auth fail") || lower.contains("authentication")) {
            return false;
        }
        return lower.contains("connect timed out")
                || lower.contains("connection timed out")
                || lower.contains("timeout")
                || lower.contains("connection reset")
                || lower.contains("connection refused")
                || lower.contains("broken pipe")
                || lower.contains("no route to host");
    }

    public static String toUserMessage(Throwable error) {
        String message = rootMessage(error);
        if (message == null || message.isBlank()) {
            return "SSH connection failed";
        }
        String lower = message.toLowerCase(Locale.ROOT);
        if (lower.contains("algorithm negotiation fail")) {
            return "SSH algorithm negotiation failed. The server may require legacy ssh-rsa; ensure datawise.ssh.allow-legacy-algorithms is enabled. Details: " + message;
        }
        if (lower.contains("auth fail") || lower.contains("authentication")) {
            return "SSH authentication failed. Check username (must match Xshell exactly), password, and private key. "
                    + "If a connection succeeded moments ago, JumpServer may be rate-limiting — wait 30s, close other SSH tabs, then retry. "
                    + "Re-enter the password and save; clear the private-key field when using password only. "
                    + "Details: " + message;
        }
        if (lower.contains("connection refused") || lower.contains("connect timed out")) {
            return "Cannot reach SSH server. Check host, port, firewall, and VPN. Details: " + message;
        }
        if (lower.contains("unknownhost") || lower.contains("unknown host")) {
            return "SSH host could not be resolved. Check the hostname. Details: " + message;
        }
        return "SSH connection failed: " + message;
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
}
