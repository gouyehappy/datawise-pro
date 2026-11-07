package org.apache.datawise.backend.jdbc.ssh;

import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import org.apache.datawise.backend.jdbc.ssh.SshKnownHostsFileLock;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
public class SshTunnelManager {

    private static final Logger log = LoggerFactory.getLogger(SshTunnelManager.class);
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final String LOCAL_BIND_HOST = "127.0.0.1";

    private final SshTunnelProperties sshTunnelProperties;
    private final ConcurrentMap<String, ManagedTunnel> tunnels = new ConcurrentHashMap<>();

    public SshTunnelManager(SshTunnelProperties sshTunnelProperties) {
        this.sshTunnelProperties = sshTunnelProperties != null ? sshTunnelProperties : new SshTunnelProperties();
    }

    public record TunnelEndpoint(String localHost, int localPort) {
    }

    public TunnelEndpoint open(ConnectionEntity entity, int remotePort) throws SshTunnelException {
        SshTunnelSupport.validate(entity);
        String key = SshTunnelSupport.fingerprint(entity, remotePort);
        ManagedTunnel existing = tunnels.get(key);
        if (existing != null && existing.isAlive()) {
            existing.touch();
            return existing.endpoint();
        }
        if (existing != null) {
            existing.closeQuietly();
            tunnels.remove(key, existing);
        }
        ManagedTunnel created = ManagedTunnel.connect(entity, remotePort, CONNECT_TIMEOUT_MS, sshTunnelProperties);
        tunnels.put(key, created);
        log.info(
                "Opened SSH tunnel connectionId={} ssh={}:{} -> {}:{} via {}:{}",
                entity.getId(),
                entity.getSshHost(),
                SshTunnelSupport.sshPort(entity),
                entity.getHost(),
                remotePort,
                created.endpoint().localHost(),
                created.endpoint().localPort()
        );
        return created.endpoint();
    }

    public void evict(ConnectionEntity entity) {
        if (entity == null || entity.getId() == null || entity.getId().isBlank()) {
            return;
        }
        String prefix = entity.getId().trim() + "|";
        tunnels.entrySet().removeIf(entry -> {
            if (!entry.getKey().startsWith(prefix)) {
                return false;
            }
            entry.getValue().closeQuietly();
            return true;
        });
    }

    @Scheduled(fixedRate = 60_000)
    void evictIdleTunnelsScheduled() {
        int idleTtlMinutes = sshTunnelProperties.getIdleTtlMinutes();
        if (idleTtlMinutes <= 0) {
            return;
        }
        long cutoff = System.currentTimeMillis() - idleTtlMinutes * 60_000L;
        tunnels.entrySet().removeIf(entry -> {
            if (entry.getValue().lastUsedAtMs >= cutoff) {
                return false;
            }
            entry.getValue().closeQuietly();
            log.info("Closed idle SSH tunnel key={}", entry.getKey());
            return true;
        });
    }

    private static final class ManagedTunnel {
        private final TunnelEndpoint endpoint;
        private final Session session;
        private volatile long lastUsedAtMs;

        private ManagedTunnel(TunnelEndpoint endpoint, Session session) {
            this.endpoint = endpoint;
            this.session = session;
            this.lastUsedAtMs = System.currentTimeMillis();
        }

        private void touch() {
            lastUsedAtMs = System.currentTimeMillis();
        }

        private TunnelEndpoint endpoint() {
            return endpoint;
        }

        private boolean isAlive() {
            return session != null && session.isConnected();
        }

        private void closeQuietly() {
            if (session == null) {
                return;
            }
            try {
                session.disconnect();
            } catch (RuntimeException ex) {
                ExceptionLogging.warn(log, "SSH tunnel disconnect failed", ex);
            }
        }

        private static ManagedTunnel connect(
                ConnectionEntity entity,
                int remotePort,
                int timeoutMs,
                SshTunnelProperties properties
        ) throws SshTunnelException {
            try {
                SshJschCompatibility.applyGlobalDefaults();
                JSch jsch = new JSch();
                if (properties.isStrictHostKeyChecking()) {
                    SshKnownHostsSupport.configureKnownHosts(jsch, properties);
                }
                boolean hasPrivateKey = SshPrivateKeySupport.looksLikePemPrivateKey(entity.getSshPrivateKey());
                if (hasPrivateKey) {
                    byte[] keyBytes = entity.getSshPrivateKey().getBytes(StandardCharsets.UTF_8);
                    byte[] passphrase = entity.getSshPassphrase() != null && !entity.getSshPassphrase().isBlank()
                            ? entity.getSshPassphrase().getBytes(StandardCharsets.UTF_8)
                            : null;
                    jsch.addIdentity("dw-ssh-key", keyBytes, null, passphrase);
                }
                Session session = jsch.getSession(
                        entity.getSshUser().trim(),
                        entity.getSshHost().trim(),
                        SshTunnelSupport.sshPort(entity)
                );
                SshJschAuthSupport.configure(
                        session,
                        entity.getSshUser(),
                        entity.getSshPassword(),
                        entity.getSshPassphrase(),
                        hasPrivateKey
                );
                session.setConfig("StrictHostKeyChecking", SshKnownHostsSupport.strictHostKeyCheckingMode(properties));
                synchronized (SshKnownHostsFileLock.LOCK) {
                    session.connect(timeoutMs);
                    SshKnownHostsSupport.persistKnownHosts(jsch, properties);
                }
                int localPort = session.setPortForwardingL(
                        LOCAL_BIND_HOST,
                        0,
                        entity.getHost().trim(),
                        remotePort
                );
                return new ManagedTunnel(new TunnelEndpoint(LOCAL_BIND_HOST, localPort), session);
            } catch (JSchException ex) {
                throw new SshTunnelException(SshTunnelSupport.toUserMessage(ex), ex);
            }
        }
    }
}
