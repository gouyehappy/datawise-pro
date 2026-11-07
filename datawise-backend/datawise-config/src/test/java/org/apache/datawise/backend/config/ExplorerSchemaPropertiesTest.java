package org.apache.datawise.backend.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ExplorerSchemaPropertiesTest {

    @Test
    void setters_clampUnsafeValues() {
        ExplorerSchemaProperties properties = new ExplorerSchemaProperties();
        properties.setIdleTimeoutMs(100);
        properties.setMaxEntries(0);

        assertEquals(1_000, properties.getIdleTimeoutMs());
        assertEquals(1, properties.getMaxEntries());
    }
}
