package org.apache.datawise.backend.server.communityplugin;

import org.apache.datawise.backend.domain.communityplugin.CommunityPluginException;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CommunityPluginReferenceGuardTest {

    @Test
    void refusesUninstallWhenConnectionReferencesPlugin() {
        ConnectionEntity connection = new ConnectionEntity();
        connection.setId("c1");
        connection.setName("Hello prod");
        connection.setPluginId("io.datawise.example.hello");

        CommunityPluginException error = assertThrows(
                CommunityPluginException.class,
                () -> CommunityPluginReferenceGuard.refuseIfReferenced(
                        "io.datawise.example.hello",
                        List.of(connection)
                )
        );
        assertTrue(error.getMessage().contains("Hello prod"));
    }

    @Test
    void allowsUninstallWhenNoConnectionReferencesPlugin() {
        ConnectionEntity connection = new ConnectionEntity();
        connection.setName("mysql");
        connection.setPluginId("other.plugin");
        assertDoesNotThrow(() -> CommunityPluginReferenceGuard.refuseIfReferenced(
                "io.datawise.example.hello",
                List.of(connection)
        ));
    }
}
