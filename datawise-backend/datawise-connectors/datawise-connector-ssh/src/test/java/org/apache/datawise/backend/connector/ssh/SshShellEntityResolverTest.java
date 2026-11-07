package org.apache.datawise.backend.connector.ssh;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SshShellEntityResolverTest {

    @Test
    void supportsNativeSshConnections() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("ssh");
        assertTrue(SshShellEntityResolver.supportsInteractiveShell(entity));
    }

    @Test
    void supportsJdbcConnectionsWithTunnelEnabled() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("mysql");
        entity.setSshEnabled(true);
        assertTrue(SshShellEntityResolver.supportsInteractiveShell(entity));
    }

    @Test
    void rejectsJdbcConnectionsWithoutTunnel() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("mysql");
        assertFalse(SshShellEntityResolver.supportsInteractiveShell(entity));
    }

    @Test
    void mapsJdbcTunnelCredentialsToShellEntity() throws SshConnectionException {
        ConnectionEntity source = new ConnectionEntity();
        source.setId("mysql-1");
        source.setDbType("mysql");
        source.setSshEnabled(true);
        source.setSshHost("10.0.0.1");
        source.setSshPort("2222");
        source.setSshUser("ops");
        source.setSshPassword("secret");

        ConnectionEntity shell = SshShellEntityResolver.resolveForShell(source);

        assertEquals("10.0.0.1", shell.getHost());
        assertEquals("2222", shell.getPort());
        assertEquals("ops", shell.getUsername());
        assertEquals("secret", shell.getPassword());
    }

    @Test
    void requiresTunnelCredentials() {
        ConnectionEntity source = new ConnectionEntity();
        source.setDbType("mysql");
        source.setSshEnabled(true);
        source.setSshHost("10.0.0.1");
        source.setSshUser("ops");

        assertThrows(SshConnectionException.class, () -> SshShellEntityResolver.resolveForShell(source));
    }
}
