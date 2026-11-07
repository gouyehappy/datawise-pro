package org.apache.datawise.backend.common;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PluginOwnedDbTypesTest {

    @Test
    void includesCanonicalTypesAndAliases() {
        assertTrue(PluginOwnedDbTypes.contains("mysql"));
        assertTrue(PluginOwnedDbTypes.contains("mssql"));
        assertTrue(PluginOwnedDbTypes.contains("dameng"));
        assertTrue(PluginOwnedDbTypes.contains("sqlite"));
        assertTrue(PluginOwnedDbTypes.contains("starrocks"));
        assertTrue(PluginOwnedDbTypes.contains("doris"));
        assertTrue(PluginOwnedDbTypes.contains("kubernetes"));
        assertTrue(PluginOwnedDbTypes.contains("nacos"));
        assertTrue(PluginOwnedDbTypes.contains("polaris"));
    }

    @Test
    void excludesGenericFallbackTypes() {
        assertFalse(PluginOwnedDbTypes.contains("generic"));
        assertFalse(PluginOwnedDbTypes.contains("other"));
    }

    @Test
    void sizeMatchesPluginOwnedTypesAndAliases() {
        assertEquals(50, PluginOwnedDbTypes.ids().size());
    }
}
