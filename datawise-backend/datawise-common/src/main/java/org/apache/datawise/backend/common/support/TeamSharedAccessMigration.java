package org.apache.datawise.backend.common.support;

import org.apache.datawise.backend.model.TeamEntity;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * One-shot schema bump: before v2, a missing access map entry meant DDL for members.
 * Materialize those as explicit {@code ddl}, then v2 treats missing as readonly.
 */
public final class TeamSharedAccessMigration {

    /** Shared-connection access map uses readonly as the implicit default. */
    public static final int SHARED_ACCESS_SCHEMA_READONLY_DEFAULT = 2;

    private TeamSharedAccessMigration() {
    }

    /**
     * @return true when the team was mutated and should be persisted
     */
    public static boolean migrate(TeamEntity team) {
        if (team == null) {
            return false;
        }
        if (team.getSharedAccessSchema() >= SHARED_ACCESS_SCHEMA_READONLY_DEFAULT) {
            return false;
        }
        Map<String, String> access = new LinkedHashMap<>(team.getSharedConnectionAccess());
        for (String id : team.getSharedConnectionIds()) {
            if (id == null || id.isBlank()) {
                continue;
            }
            String trimmed = id.trim();
            String existing = access.get(trimmed);
            if (existing == null || existing.isBlank()) {
                // Preserve pre-v2 implicit DDL for already-shared connections.
                access.put(trimmed, "ddl");
            }
        }
        team.setSharedConnectionAccess(access);
        team.setSharedAccessSchema(SHARED_ACCESS_SCHEMA_READONLY_DEFAULT);
        return true;
    }

    /** Apply to every team; returns whether any team changed. */
    public static boolean migrateAll(Iterable<TeamEntity> teams) {
        boolean dirty = false;
        if (teams == null) {
            return false;
        }
        for (TeamEntity team : teams) {
            if (migrate(team)) {
                dirty = true;
            }
        }
        return dirty;
    }
}
