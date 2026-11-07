package org.apache.datawise.backend.domain.communityplugin;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CommunityPluginCompatibilityGateTest {

    @Test
    void acceptsKnownPermissionsAndHttpsNetworkOrigins() {
        List<String> errors = new ArrayList<>();
        CommunityPluginCompatibilityGate.validatePermissions(
                List.of("host.workbench", "host.network:https://api.example.com"),
                errors);
        assertTrue(errors.isEmpty());
        assertEquals(List.of("https://api.example.com"),
                CommunityPluginCompatibilityGate.networkOrigins(
                        List.of("host.workbench", "host.network:https://api.example.com")));
    }

    @Test
    void rejectsUnknownPermissions() {
        List<String> errors = new ArrayList<>();
        CommunityPluginCompatibilityGate.validatePermissions(List.of("host.shell"), errors);
        assertFalse(errors.isEmpty());
    }

    @Test
    void acceptsHostSqlPermission() {
        List<String> errors = new ArrayList<>();
        CommunityPluginCompatibilityGate.validatePermissions(
                List.of("host.workbench", "host.sql"),
                errors);
        assertTrue(errors.isEmpty());
    }

    @Test
    void acceptsHostAiPermission() {
        List<String> errors = new ArrayList<>();
        CommunityPluginCompatibilityGate.validatePermissions(
                List.of("host.workbench", "host.ai"),
                errors);
        assertTrue(errors.isEmpty());
    }

    @Test
    void acceptsHostEmbedPermission() {
        List<String> errors = new ArrayList<>();
        CommunityPluginCompatibilityGate.validatePermissions(
                List.of("host.workbench", "host.embed"),
                errors);
        assertTrue(errors.isEmpty());
        assertTrue(CommunityPluginCompatibilityGate.allowsEmbed(List.of("host.embed")));
        assertFalse(CommunityPluginCompatibilityGate.allowsEmbed(List.of("host.workbench")));
    }

    @Test
    void evaluatesEngineRanges() {
        assertTrue(CommunityPluginCompatibilityGate.satisfies(">=4.1.0", "4.1.6"));
        assertFalse(CommunityPluginCompatibilityGate.satisfies(">=4.2.0", "4.1.6"));
        assertTrue(CommunityPluginCompatibilityGate.satisfies("^1.0", "1.2"));
        assertFalse(CommunityPluginCompatibilityGate.satisfies("^1.0", "2.0"));
    }
}
