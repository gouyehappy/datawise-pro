package org.apache.datawise.backend.connector.ssh;

import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import org.apache.datawise.backend.jdbc.ssh.SshJschAuthSupport;
import org.apache.datawise.backend.jdbc.ssh.SshJschCompatibility;
import org.apache.datawise.backend.jdbc.ssh.SshKnownHostsFileLock;
import org.apache.datawise.backend.jdbc.ssh.SshPrivateKeySupport;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.ConcurrentHashMap;

final class SshJschSessions {

    private static final Logger log = LoggerFactory.getLogger(SshJschSessions.class);
    private static final int AUTH_RETRY_DELAY_MS = 2_000;
    private static final String LOCAL_BIND_HOST = "127.0.0.1";
    private static final ConcurrentHashMap<String, Object> CONNECT_LOCKS = new ConcurrentHashMap<>();

    private SshJschSessions() {
    }

    /** Target shell session plus optional jump session that must stay open for the L-forward. */
    record OpenedSessions(Session target, Session jump) {
        void disconnectQuietly() {
            if (target != null) {
                try {
                    target.disconnect();
                } catch (RuntimeException ignored) {
                    // best effort
                }
            }
            if (jump != null) {
                try {
                    jump.disconnect();
                } catch (RuntimeException ignored) {
                    // best effort
                }
            }
        }
    }

    static OpenedSessions openSession(ConnectionEntity entity, SshClientProperties properties) throws JSchException {
        Object lock = CONNECT_LOCKS.computeIfAbsent(connectLockKey(entity), ignored -> new Object());
        synchronized (lock) {
            JSchException lastFailure = null;
            for (int attempt = 1; attempt <= 2; attempt++) {
                OpenedSessions opened = null;
                try {
                    opened = connectOnce(entity, properties);
                    return opened;
                } catch (JSchException ex) {
                    lastFailure = ex;
                    if (opened != null) {
                        opened.disconnectQuietly();
                    }
                    if (attempt >= 2 || !shouldRetry(ex)) {
                        throw ex;
                    }
                    log.info(
                            "SSH connect attempt {} failed for {}@{}:{} — retrying after {}ms ({})",
                            attempt,
                            entity.getUsername(),
                            entity.getHost(),
                            SshConnectionSupport.sshPort(entity),
                            AUTH_RETRY_DELAY_MS,
                            ex.getMessage()
                    );
                    sleepQuietly(AUTH_RETRY_DELAY_MS);
                }
            }
            if (lastFailure != null) {
                throw lastFailure;
            }
            throw new JSchException("SSH connect failed");
        }
    }

    private static OpenedSessions connectOnce(ConnectionEntity entity, SshClientProperties properties)
            throws JSchException {
        if (properties.isAllowLegacyAlgorithms()) {
            SshJschCompatibility.applyGlobalDefaults();
        }
        if (!SshConnectionSupport.isJumpEnabled(entity)) {
            return new OpenedSessions(connectDirect(entity, properties, null), null);
        }

        try {
            SshConnectionSupport.validateJump(entity);
        } catch (SshConnectionException ex) {
            throw new JSchException(ex.getMessage(), ex);
        }
        Session jump = null;
        try {
            jump = connectJump(entity, properties);
            int targetPort = SshConnectionSupport.sshPort(entity);
            int localPort = jump.setPortForwardingL(
                    LOCAL_BIND_HOST,
                    0,
                    entity.getHost().trim(),
                    targetPort
            );
            Session target = connectDirect(entity, properties, localPort);
            return new OpenedSessions(target, jump);
        } catch (JSchException | RuntimeException ex) {
            if (jump != null) {
                try {
                    jump.disconnect();
                } catch (RuntimeException ignored) {
                    // best effort
                }
            }
            if (ex instanceof JSchException jschEx) {
                throw jschEx;
            }
            throw new JSchException("SSH jump connect failed: " + ex.getMessage(), ex);
        }
    }

    private static Session connectJump(ConnectionEntity entity, SshClientProperties properties) throws JSchException {
        JSch jsch = new JSch();
        if (properties.isStrictHostKeyChecking()) {
            properties.configureKnownHosts(jsch);
        }
        boolean hasPrivateKey = SshPrivateKeySupport.looksLikePemPrivateKey(entity.getJumpPrivateKey());
        if (hasPrivateKey) {
            addIdentity(jsch, "dw-ssh-jump-key", entity.getJumpPrivateKey(), entity.getJumpPassphrase());
        }
        Session session = jsch.getSession(
                entity.getSshUser().trim(),
                entity.getSshHost().trim(),
                SshConnectionSupport.jumpPort(entity)
        );
        SshJschAuthSupport.configure(
                session,
                entity.getSshUser(),
                entity.getSshPassword(),
                entity.getJumpPassphrase(),
                hasPrivateKey
        );
        session.setConfig("StrictHostKeyChecking", properties.strictHostKeyCheckingMode());
        session.setConfig("TCPKeepAlive", "yes");
        synchronized (SshKnownHostsFileLock.LOCK) {
            session.connect(properties.getConnectTimeoutMs());
            properties.persistKnownHosts(jsch);
        }
        applyKeepAlive(session, properties);
        return session;
    }

    /**
     * @param localForwardPort when non-null, connect to {@code 127.0.0.1:localForwardPort} (via jump L-forward)
     */
    private static Session connectDirect(
            ConnectionEntity entity,
            SshClientProperties properties,
            Integer localForwardPort
    ) throws JSchException {
        JSch jsch = new JSch();
        if (properties.isStrictHostKeyChecking()) {
            properties.configureKnownHosts(jsch);
        }
        boolean hasPrivateKey = SshPrivateKeySupport.looksLikePemPrivateKey(entity.getSshPrivateKey());
        if (hasPrivateKey) {
            addIdentity(jsch, "dw-ssh-key", entity.getSshPrivateKey(), entity.getSshPassphrase());
        }
        String host = localForwardPort != null ? LOCAL_BIND_HOST : entity.getHost().trim();
        int port = localForwardPort != null ? localForwardPort : SshConnectionSupport.sshPort(entity);
        Session session = jsch.getSession(entity.getUsername().trim(), host, port);
        if (localForwardPort != null) {
            // Host key is for the real target, not 127.0.0.1.
            session.setHostKeyAlias(entity.getHost().trim());
        }
        SshJschAuthSupport.configure(
                session,
                entity.getUsername(),
                entity.getPassword(),
                entity.getSshPassphrase(),
                hasPrivateKey
        );
        session.setConfig("StrictHostKeyChecking", properties.strictHostKeyCheckingMode());
        session.setConfig("TCPKeepAlive", "yes");
        synchronized (SshKnownHostsFileLock.LOCK) {
            session.connect(properties.getConnectTimeoutMs());
            properties.persistKnownHosts(jsch);
        }
        applyKeepAlive(session, properties);
        return session;
    }

    private static void addIdentity(JSch jsch, String name, String privateKey, String passphrase)
            throws JSchException {
        byte[] keyBytes = privateKey.getBytes(StandardCharsets.UTF_8);
        byte[] pass = passphrase != null && !passphrase.isBlank()
                ? passphrase.getBytes(StandardCharsets.UTF_8)
                : null;
        jsch.addIdentity(name, keyBytes, null, pass);
    }

    private static void applyKeepAlive(Session session, SshClientProperties properties) throws JSchException {
        int aliveIntervalMs = properties.getServerAliveIntervalMs();
        if (aliveIntervalMs > 0) {
            session.setServerAliveInterval(aliveIntervalMs);
            session.setServerAliveCountMax(properties.getServerAliveCountMax());
        }
    }

    private static boolean shouldRetry(JSchException error) {
        // JumpServer rate-limits auth; retry only on fast auth failures, not on slow TCP timeouts.
        return SshConnectionSupport.isAuthFailure(error);
    }

    private static String connectLockKey(ConnectionEntity entity) {
        String base = entity.getHost().trim().toLowerCase()
                + ":"
                + SshConnectionSupport.sshPort(entity)
                + ":"
                + entity.getUsername().trim().toLowerCase();
        if (!SshConnectionSupport.isJumpEnabled(entity)) {
            return base;
        }
        return base
                + "|jump:"
                + entity.getSshHost().trim().toLowerCase()
                + ":"
                + SshConnectionSupport.jumpPort(entity)
                + ":"
                + entity.getSshUser().trim().toLowerCase();
    }

    private static void sleepQuietly(long delayMs) throws JSchException {
        try {
            Thread.sleep(delayMs);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new JSchException("SSH connect interrupted", interrupted);
        }
    }
}
