package org.apache.datawise.backend.configstore.support;

import org.apache.datawise.backend.model.TeamAuditLogEntity;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TeamAuditLogFiltersTest {

    @Test
    void matchesActorAndTimeRange() {
        TeamAuditLogEntity log = new TeamAuditLogEntity();
        log.setActorUserId(42L);
        log.setCreatedAt(Instant.parse("2026-06-15T10:00:00Z"));

        assertTrue(TeamAuditLogFilters.matches(
                log,
                42L,
                Instant.parse("2026-06-15T00:00:00Z"),
                Instant.parse("2026-06-16T00:00:00Z")));
        assertFalse(TeamAuditLogFilters.matches(log, 7L, null, null));
        assertFalse(TeamAuditLogFilters.matches(
                log,
                null,
                Instant.parse("2026-06-16T00:00:00Z"),
                null));
    }
}
