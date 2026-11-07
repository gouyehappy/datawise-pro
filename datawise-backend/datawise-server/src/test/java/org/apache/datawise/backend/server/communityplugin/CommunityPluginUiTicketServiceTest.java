package org.apache.datawise.backend.server.communityplugin;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;

class CommunityPluginUiTicketServiceTest {

    private final CommunityPluginUiTicketService service = new CommunityPluginUiTicketService();

    @Test
    void issueAndResolveTicketForMatchingPlugin() {
        var issued = service.issue("session-1", "io.datawise.community.ssh");
        assertFalse(issued.ticket().isBlank());
        assertEquals(
                "session-1",
                service.resolveTicket(issued.ticket(), "io.datawise.community.ssh").orElseThrow()
        );
    }

    @Test
    void rejectsTicketForOtherPlugin() {
        var issued = service.issue("session-1", "plugin-a");
        assertTrue(service.resolveTicket(issued.ticket(), "plugin-b").isEmpty());
    }

    @Test
    void grantResolvesAfterMint() {
        String grant = service.mintGrant("session-9", "plugin-x");
        assertEquals("session-9", service.resolveGrant(grant, "plugin-x").orElseThrow());
        assertTrue(service.resolveGrant(grant, "plugin-y").isEmpty());
    }

    @Test
    void extractPluginIdFromUiPath() {
        assertEquals(
                "io.datawise.community.ssh",
                CommunityPluginUiTicketService.extractPluginIdFromUiPath(
                        "/api/community-plugins/io.datawise.community.ssh/ui/index.html"
                )
        );
        assertEquals(
                null,
                CommunityPluginUiTicketService.extractPluginIdFromUiPath("/api/explorer/tree")
        );
    }
}
