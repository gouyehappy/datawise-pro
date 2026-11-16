package org.apache.datawise.backend.common.support;

import org.apache.datawise.backend.model.TeamEntity;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TeamSharedAccessMigrationTest {

    @Test
    void materializesImplicitDdlAndBumpsSchema() {
        TeamEntity team = new TeamEntity();
        team.setSharedConnectionIds(new ArrayList<>(List.of("a", "b")));
        team.setSharedConnectionAccess(Map.of("a", "readonly"));

        assertTrue(TeamSharedAccessMigration.migrate(team));
        assertEquals(TeamSharedAccessMigration.SHARED_ACCESS_SCHEMA_READONLY_DEFAULT, team.getSharedAccessSchema());
        assertEquals("readonly", team.getSharedConnectionAccess().get("a"));
        assertEquals("ddl", team.getSharedConnectionAccess().get("b"));
        assertFalse(TeamSharedAccessMigration.migrate(team));
    }

    @Test
    void skipsWhenAlreadyOnReadonlyDefaultSchema() {
        TeamEntity team = new TeamEntity();
        team.setSharedAccessSchema(TeamSharedAccessMigration.SHARED_ACCESS_SCHEMA_READONLY_DEFAULT);
        team.setSharedConnectionIds(List.of("a"));
        assertFalse(TeamSharedAccessMigration.migrate(team));
        assertTrue(team.getSharedConnectionAccess().isEmpty());
    }
}
