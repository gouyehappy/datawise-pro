package org.apache.datawise.backend.polaris;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PolarisConnectionConfigTest {

    @Test
    void from_defaultsToHttpWithoutContext() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("10.0.0.2");
        entity.setPort("8090");
        PolarisConnectionConfig config = PolarisConnectionConfig.from(entity);
        assertEquals("http://10.0.0.2:8090", config.baseUrl());
        assertFalse(config.https());
        assertNull(config.staticToken());
        assertFalse(config.hasPasswordLogin());
    }

    @Test
    void from_usesPasswordAsTokenWhenUsernameMissing() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("polaris.example.com");
        entity.setPort("8090");
        entity.setPassword("secret-token");
        PolarisConnectionConfig config = PolarisConnectionConfig.from(entity);
        assertEquals("secret-token", config.staticToken());
        assertFalse(config.hasPasswordLogin());
    }

    @Test
    void from_keepsPasswordForLoginWhenUsernamePresent() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("polaris.example.com");
        entity.setPort("80");
        entity.setUsername("sdp");
        entity.setPassword("Secret@123");
        PolarisConnectionConfig config = PolarisConnectionConfig.from(entity);
        assertTrue(config.hasPasswordLogin());
        assertNull(config.staticToken());
        assertEquals("sdp", config.username());
        assertEquals("Secret@123", config.password());
        assertEquals("polaris", config.owner());
    }

    @Test
    void from_honorsAdvancedTokenAndHttps() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("https://polaris.example.com:8443");
        entity.setUsername("sdp");
        entity.setPassword("ignored-for-static");
        entity.setAdvancedConfig("token=adv-token\nuseHttps=true\nowner=acme");
        PolarisConnectionConfig config = PolarisConnectionConfig.from(entity);
        assertEquals("https://polaris.example.com:8443", config.baseUrl());
        assertEquals("adv-token", config.staticToken());
        assertEquals("acme", config.owner());
        assertTrue(config.https());
    }
}
