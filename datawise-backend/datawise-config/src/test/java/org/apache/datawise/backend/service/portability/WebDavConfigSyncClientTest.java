package org.apache.datawise.backend.service.portability;

import org.junit.jupiter.api.Test;

import java.net.URI;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class WebDavConfigSyncClientTest {

    @Test
    void resolveTargetJoinsBaseAndRelativePath() {
        URI uri = WebDavConfigSyncClient.resolveTarget(
                "https://nas.example/remote.php/dav/files/alice",
                "datawise/profile-sync.dwprofile");
        assertEquals(
                "https://nas.example/remote.php/dav/files/alice/datawise/profile-sync.dwprofile",
                uri.toString());
    }

    @Test
    void resolveTargetRequiresBaseUrl() {
        assertThrows(IllegalArgumentException.class,
                () -> WebDavConfigSyncClient.resolveTarget(" ", "x.dwprofile"));
    }
}
