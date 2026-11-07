package org.apache.datawise.backend.jdbc.connection;

import org.apache.datawise.backend.jdbc.ssh.SshTunnelException;
import org.apache.datawise.backend.jdbc.ssh.SshTunnelManager;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JdbcConnectionTargetResolverTest {

    @Mock
    private SshTunnelManager sshTunnelManager;

    @Test
    void resolve_usesDbTypeDefaultPortWhenConnectionPortBlank() throws SshTunnelException, SQLException {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("dm");
        entity.setHost("db.example");
        entity.setSshEnabled(true);
        entity.setSshHost("bastion.example");
        entity.setSshUser("jump");
        entity.setSshPassword("secret");

        when(sshTunnelManager.open(eq(entity), eq(5236)))
                .thenReturn(new SshTunnelManager.TunnelEndpoint("127.0.0.1", 55001));

        JdbcConnectionTargetResolver resolver = new JdbcConnectionTargetResolver(sshTunnelManager);
        JdbcConnectionTargetResolver.ResolvedJdbcTarget target = resolver.resolve(entity);

        assertEquals("jdbc:dm://127.0.0.1:55001", target.jdbcUrl());
        verify(sshTunnelManager).open(entity, 5236);
    }

    @Test
    void resolve_prefersExplicitConnectionPortOverDbTypeDefault() throws SshTunnelException, SQLException {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("tdengine");
        entity.setHost("db.example");
        entity.setPort("7000");
        entity.setDatabaseName("metrics");
        entity.setSshEnabled(true);
        entity.setSshHost("bastion.example");
        entity.setSshUser("jump");
        entity.setSshPassword("secret");

        ArgumentCaptor<Integer> remotePort = ArgumentCaptor.forClass(Integer.class);
        when(sshTunnelManager.open(eq(entity), any(Integer.class)))
                .thenReturn(new SshTunnelManager.TunnelEndpoint("127.0.0.1", 55002));

        JdbcConnectionTargetResolver resolver = new JdbcConnectionTargetResolver(sshTunnelManager);
        resolver.resolve(entity);

        verify(sshTunnelManager).open(eq(entity), remotePort.capture());
        assertEquals(7000, remotePort.getValue());
    }
}
