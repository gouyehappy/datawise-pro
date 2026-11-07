package org.apache.datawise.backend.common.support;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConnectionEnvironmentSupportTest {

    @Test
    void defaultsBlankEnvToDev() {
        var normalized = ConnectionEnvironmentSupport.normalize(null, null);
        assertEquals(ConnectionEnvironmentSupport.DEV, normalized.env());
        assertNull(normalized.envCustom());
    }

    @Test
    void migratesLegacyUppercaseValues() {
        assertEquals(ConnectionEnvironmentSupport.DEV,
                ConnectionEnvironmentSupport.normalize("TEST", null).env());
        assertEquals(ConnectionEnvironmentSupport.STAGING,
                ConnectionEnvironmentSupport.normalize("STAGING", null).env());
        assertEquals(ConnectionEnvironmentSupport.PROD,
                ConnectionEnvironmentSupport.normalize("PROD", null).env());
    }

    @Test
    void preservesCustomLabel() {
        var normalized = ConnectionEnvironmentSupport.normalize("custom", " QA ");
        assertEquals(ConnectionEnvironmentSupport.CUSTOM, normalized.env());
        assertEquals("QA", normalized.envCustom());
    }

    @Test
    void migratesUnknownFreeTextToCustom() {
        var normalized = ConnectionEnvironmentSupport.normalize("preprod", null);
        assertEquals(ConnectionEnvironmentSupport.CUSTOM, normalized.env());
        assertEquals("preprod", normalized.envCustom());
    }

    @Test
    void detectsDevelopmentConnection() {
        ConnectionEntity dev = new ConnectionEntity();
        dev.setEnv("dev");
        assertTrue(ConnectionEnvironmentSupport.isDevelopment(dev));

        ConnectionEntity prod = new ConnectionEntity();
        prod.setEnv("prod");
        assertFalse(ConnectionEnvironmentSupport.isDevelopment(prod));
    }

    @Test
    void applyToEntityMutatesFields() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setEnv("PROD");
        entity.setEnvCustom("ignored");

        ConnectionEnvironmentSupport.applyToEntity(entity);

        assertEquals(ConnectionEnvironmentSupport.PROD, entity.getEnv());
        assertNull(entity.getEnvCustom());
    }
}
