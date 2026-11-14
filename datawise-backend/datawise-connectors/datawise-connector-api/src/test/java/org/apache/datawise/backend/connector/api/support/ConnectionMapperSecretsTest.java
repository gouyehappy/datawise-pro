package org.apache.datawise.backend.connector.api.support;

import org.apache.datawise.backend.domain.ConnectionConfig;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Regression for the secrets clearing bug: an all-empty secret form must reach
 * {@code applyDto} as '{}' and overwrite stale stored secrets — not be dropped
 * from the payload, which kept the old values alive.
 */
class ConnectionMapperSecretsTest {

    @Test
    void emptySecretsObjectOverwritesStoredSecrets() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setPluginSecrets("{\"private_key\":\"OLD\"}");

        ConnectionConfig config = new ConnectionConfig();
        config.setSecrets("{}");

        ConnectionMapper.applyDto(entity, config);
        assertEquals("{}", entity.getPluginSecrets());
    }

    @Test
    void secretsRoundTripThroughDto() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setPluginSecrets("{\"totp_secret\":\"abc\"}");

        ConnectionConfig config = ConnectionMapper.toDto(entity);
        assertEquals("{\"totp_secret\":\"abc\"}", config.getSecrets());

        ConnectionEntity target = new ConnectionEntity();
        ConnectionMapper.applyDto(target, config);
        assertEquals("{\"totp_secret\":\"abc\"}", target.getPluginSecrets());
    }

    @Test
    void publicDtoOmitsSecretMaterialButKeepsPresenceFlags() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setPassword("db-secret");
        entity.setSshPassword("ssh-secret");
        entity.setPluginSecrets("{\"totp_secret\":\"abc\"}");

        ConnectionConfig config = ConnectionMapper.toPublicDto(entity);
        assertEquals(Boolean.TRUE, config.getHasPassword());
        assertEquals(Boolean.TRUE, config.getHasSshPassword());
        assertEquals(Boolean.TRUE, config.getHasSecrets());
        assertNull(config.getPassword());
        assertNull(config.getSshPassword());
        assertNull(config.getSecrets());
    }

    @Test
    void nullSecretsLeavesEntityUntouched() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setPluginSecrets("{\"keep\":true}");

        ConnectionConfig config = new ConnectionConfig();

        ConnectionMapper.applyDto(entity, config);
        assertEquals("{\"keep\":true}", entity.getPluginSecrets());

        assertNull(ConnectionMapper.toDto(new ConnectionEntity()).getSecrets());
    }
}
