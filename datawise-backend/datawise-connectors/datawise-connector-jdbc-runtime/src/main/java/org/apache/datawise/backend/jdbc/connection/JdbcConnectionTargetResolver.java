package org.apache.datawise.backend.jdbc.connection;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.jdbc.ssh.SshTunnelException;
import org.apache.datawise.backend.jdbc.ssh.SshTunnelManager;
import org.apache.datawise.backend.jdbc.ssh.SshTunnelSupport;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Component;

import java.sql.SQLException;

@Component
public class JdbcConnectionTargetResolver {

    private final SshTunnelManager sshTunnelManager;

    public JdbcConnectionTargetResolver(SshTunnelManager sshTunnelManager) {
        this.sshTunnelManager = sshTunnelManager;
    }

    public ResolvedJdbcTarget resolve(ConnectionEntity entity) throws SQLException {
        if (!SshTunnelSupport.isEnabled(entity)) {
            return ResolvedJdbcTarget.direct(JdbcUrlBuilder.buildJdbcUrl(entity));
        }
        try {
            DbType dbType = DbType.parse(entity.getDbType());
            int remotePort = SshTunnelSupport.remoteDbPort(entity, dbType.getPort());
            SshTunnelManager.TunnelEndpoint tunnel = sshTunnelManager.open(entity, remotePort);
            String jdbcUrl = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(
                    entity,
                    tunnel.localHost(),
                    tunnel.localPort()
            );
            return new ResolvedJdbcTarget(jdbcUrl, true);
        } catch (SshTunnelException ex) {
            throw new SQLException(ex.getMessage(), ex);
        }
    }

    public void evictTunnel(ConnectionEntity entity) {
        sshTunnelManager.evict(entity);
    }

    public record ResolvedJdbcTarget(String jdbcUrl, boolean viaSshTunnel) {
        public static ResolvedJdbcTarget direct(String jdbcUrl) {
            return new ResolvedJdbcTarget(jdbcUrl, false);
        }
    }
}
