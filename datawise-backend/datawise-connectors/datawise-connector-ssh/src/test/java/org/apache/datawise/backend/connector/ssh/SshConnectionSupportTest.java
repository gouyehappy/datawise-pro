package org.apache.datawise.backend.connector.ssh;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SshConnectionSupportTest {

    @Test
    void sshPort_defaultsTo22WhenBlank() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setPort("");
        assertEquals(22, SshConnectionSupport.sshPort(entity));
    }

    @Test
    void describeCredentials_reportsMissingPassword() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setUsername("roger xie");
        entity.setPassword("");
        entity.setSshPrivateKey("not-a-key");

        assertEquals(
                "username='roger xie', password=missing, privateKey=no (ignored non-PEM text in private-key field)",
                SshConnectionSupport.describeCredentials(entity)
        );
    }

    @Test
    void isAuthFailure_detectsAuthFailMessage() {
        assertEquals(true, SshConnectionSupport.isAuthFailure(
                new Exception("Auth fail for methods 'password,publickey'")
        ));
    }

    @Test
    void isTransientConnectFailure_detectsTimeoutButNotAuthFail() {
        assertEquals(true, SshConnectionSupport.isTransientConnectFailure(
                new Exception("java.net.SocketTimeoutException: connect timed out")
        ));
        assertEquals(false, SshConnectionSupport.isTransientConnectFailure(
                new Exception("Auth fail for methods 'password,publickey'")
        ));
    }

    @Test
    void validate_requiresJumpCredentialsWhenEnabled() throws Exception {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("10.0.0.8");
        entity.setUsername("ops");
        entity.setPassword("secret");
        entity.setSshEnabled(true);
        entity.setSshHost("bastion.example");
        assertThrows(SshConnectionException.class, () -> SshConnectionSupport.validate(entity));

        entity.setSshUser("jump");
        entity.setSshPassword("jump-secret");
        SshConnectionSupport.validate(entity);
        assertEquals(22, SshConnectionSupport.jumpPort(entity));
    }

    @Test
    void validate_requiresHostUserAndCredential() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("bastion.example");
        entity.setUsername("ops");
        entity.setPassword("secret");

        assertThrows(SshConnectionException.class, () -> SshConnectionSupport.validate(null));
        assertThrows(SshConnectionException.class, () -> {
            ConnectionEntity missingHost = new ConnectionEntity();
            missingHost.setUsername("ops");
            missingHost.setPassword("secret");
            SshConnectionSupport.validate(missingHost);
        });
    }
}
