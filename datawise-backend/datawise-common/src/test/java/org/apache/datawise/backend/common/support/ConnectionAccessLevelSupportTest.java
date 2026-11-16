package org.apache.datawise.backend.common.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConnectionAccessLevelSupportTest {

    @Test
    void parsesStoredAccessLevels() {
        assertEquals(ConnectionAccessLevel.READONLY, ConnectionAccessLevelSupport.fromStored("read"));
        assertEquals(ConnectionAccessLevel.READONLY, ConnectionAccessLevelSupport.fromStored("readonly"));
        assertEquals(ConnectionAccessLevel.READWRITE, ConnectionAccessLevelSupport.fromStored("readwrite"));
        assertEquals(ConnectionAccessLevel.DDL, ConnectionAccessLevelSupport.fromStored("write"));
        assertEquals(ConnectionAccessLevel.READONLY, ConnectionAccessLevelSupport.fromStored(null));
        assertEquals(ConnectionAccessLevel.READONLY, ConnectionAccessLevelSupport.fromStored("weird-level"));
    }

    @Test
    void persistsElevationsAboveReadonlyDefault() {
        assertFalse(ConnectionAccessLevelSupport.shouldPersist("readonly"));
        assertTrue(ConnectionAccessLevelSupport.shouldPersist("readwrite"));
        assertTrue(ConnectionAccessLevelSupport.shouldPersist("ddl"));
    }
}
