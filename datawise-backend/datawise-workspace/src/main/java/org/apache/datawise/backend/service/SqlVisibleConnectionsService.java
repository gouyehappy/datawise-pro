package org.apache.datawise.backend.service;

import org.apache.datawise.backend.common.support.ConnectionAccessLevel;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.domain.SqlVisibleConnectionDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Lists connections visible to the current user with the same semantics as the desktop
 * catalog (ownership + team share), including effective shared-connection access.
 */
@Service
public class SqlVisibleConnectionsService {

    private final ConnectionVisibilityService connectionVisibilityService;
    private final ConnectionAccessService connectionAccessService;
    private final TeamStore teamStore;

    public SqlVisibleConnectionsService(
            ConnectionVisibilityService connectionVisibilityService,
            ConnectionAccessService connectionAccessService,
            TeamStore teamStore
    ) {
        this.connectionVisibilityService = connectionVisibilityService;
        this.connectionAccessService = connectionAccessService;
        this.teamStore = teamStore;
    }

    public List<SqlVisibleConnectionDto> listForCurrentUser() {
        long userId = UserContext.requireUserId();
        Set<String> sharedIds = teamSharedConnectionIds(userId);
        List<SqlVisibleConnectionDto> rows = new ArrayList<>();
        for (ConnectionEntity connection : connectionVisibilityService.visibleCatalogForCurrentUser().connections()) {
            if (connection == null || connection.getId() == null || connection.getId().isBlank()) {
                continue;
            }
            ConnectionAccessLevel level = connectionAccessService.resolveAccess(userId, connection.getId());
            rows.add(new SqlVisibleConnectionDto(
                    connection.getId(),
                    connection.getName(),
                    connection.getDbType(),
                    connection.getEnv(),
                    level.name().toLowerCase(Locale.ROOT),
                    sharedIds.contains(connection.getId())
            ));
        }
        return rows;
    }

    private Set<String> teamSharedConnectionIds(long userId) {
        Set<String> shared = new HashSet<>();
        for (TeamMemberEntity membership : teamStore.findMembersByUserId(userId)) {
            TeamEntity team = teamStore.findTeamById(membership.getTeamId()).orElse(null);
            if (team == null) {
                continue;
            }
            shared.addAll(team.getSharedConnectionIds());
        }
        return shared;
    }
}
