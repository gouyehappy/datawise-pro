package org.apache.datawise.backend.terminal;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TerminalPtySessionManagerTest {

    private final TerminalPtySessionManager manager = new TerminalPtySessionManager();

    @Test
    void tracksSessionOwner() throws Exception {
        manager.create("sess-a", 10L, 80, 24);
        assertTrue(manager.isOwner("sess-a", 10L));
        assertFalse(manager.isOwner("sess-a", 11L));
        assertEquals(10L, manager.getOwnerUserId("sess-a"));
        manager.destroy("sess-a");
        assertFalse(manager.isOwner("sess-a", 10L));
    }

    @Test
    void replacesExistingSessionForSameUser() throws Exception {
        manager.create("sess-a", 10L, 80, 24);
        manager.create("sess-b", 10L, 100, 30);
        assertFalse(manager.isOwner("sess-a", 10L));
        assertTrue(manager.isOwner("sess-b", 10L));
    }
}
