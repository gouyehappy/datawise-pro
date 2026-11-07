package org.apache.datawise.backend.configstore.support;

import org.apache.datawise.backend.model.TeamAuditLogEntity;

import java.time.Instant;

public final class TeamAuditLogFilters {

    private TeamAuditLogFilters() {
    }

    public static boolean matches(
                                  TeamAuditLogEntity log,
                                  Long actorUserId,
                                  Instant since,
                                  Instant until) {
        if (actorUserId != null && !actorUserId.equals(log.getActorUserId())) {
            return false;
        }
        Instant createdAt = log.getCreatedAt();
        if (createdAt == null) {
            return since == null && until == null;
        }
        if (since != null && createdAt.isBefore(since)) {
            return false;
        }
        if (until != null && createdAt.isAfter(until)) {
            return false;
        }
        return true;
    }
}
