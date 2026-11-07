package org.apache.datawise.backend.jdbc.ssh;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SshTunnelSupportTest {

    @Test
    void validate_requiresHostUserAndCredential() {
        ConnectionEntity entity = baseEntity();
        entity.setSshHost("");

        SshTunnelException ex = assertThrows(SshTunnelException.class, () -> SshTunnelSupport.validate(entity));
        assertEquals("SSH host is required when SSH tunnel is enabled", ex.getMessage());
    }

    @Test
    void validate_acceptsPasswordOrPrivateKey() throws Exception {
        ConnectionEntity withPassword = baseEntity();
        withPassword.setSshPassword("secret");
        SshTunnelSupport.validate(withPassword);

        ConnectionEntity withKey = baseEntity();
        withKey.setSshPassword(null);
        withKey.setSshPrivateKey("-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----");
        SshTunnelSupport.validate(withKey);
    }

    @Test
    void fingerprint_includesConnectionAndSshFields() {
        ConnectionEntity entity = baseEntity();
        entity.setId("conn-1");
        entity.setSshPassword("pw");
        entity.setSshPrivateKey("key");

        String fingerprint = SshTunnelSupport.fingerprint(entity, 3306);

        assertTrue(fingerprint.startsWith("conn-1|bastion.example|22|deploy|"));
        assertFalse(fingerprint.contains("|pw|"));
        assertFalse(fingerprint.contains("|key|"));
        assertTrue(fingerprint.contains("db.internal|3306|"));
        String again = SshTunnelSupport.fingerprint(entity, 3306);
        assertEquals(fingerprint, again);
    }

    @Test
    void toUserMessage_mapsAuthFailure() {
        String message = SshTunnelSupport.toUserMessage(new Exception("Auth fail for methods 'publickey,password'"));
        assertTrue(message.contains("authentication failed"));
    }

    @Test
    void isEnabled_whenFlagSet() {
        ConnectionEntity entity = new ConnectionEntity();
        assertFalse(SshTunnelSupport.isEnabled(entity));
        entity.setSshEnabled(true);
        assertTrue(SshTunnelSupport.isEnabled(entity));
    }

    private static ConnectionEntity baseEntity() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setSshEnabled(true);
        entity.setSshHost("bastion.example");
        entity.setSshPort("22");
        entity.setSshUser("deploy");
        entity.setHost("db.internal");
        entity.setPort("3306");
        return entity;
    }
}
