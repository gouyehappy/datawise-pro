package org.apache.datawise.backend.service;

import org.apache.datawise.backend.common.ConnectionAccessDeniedException;
import org.apache.datawise.backend.common.ConnectionCapabilityMatrix;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.common.support.ConnectionAccessLevel;
import org.apache.datawise.backend.common.support.ConnectionAccessLevelSupport;
import org.apache.datawise.backend.connector.api.support.SqlWriteClassifier;
import org.apache.datawise.backend.common.support.TeamRoleSupport;
import org.springframework.stereotype.Service;

import java.util.HashSet;
import java.util.Set;

@Service
public class ConnectionAccessService {

    private final TeamStore teamStore;
    private final ConnectionStore connectionStore;
    private final WriteUnlockService writeUnlockService;

    public ConnectionAccessService(
            TeamStore teamStore,
            ConnectionStore connectionStore,
            WriteUnlockService writeUnlockService) {
        this.teamStore = teamStore;
        this.connectionStore = connectionStore;
        this.writeUnlockService = writeUnlockService;
    }

    public ConnectionAccessLevel resolveAccess(Long userId, String connectionId) {
        if (connectionId == null || connectionId.isBlank()) {
            return ConnectionAccessLevel.DDL;
        }

        ConnectionAccessLevel fromTeam = null;
        for (TeamMemberEntity membership : teamStore.findMembersByUserId(userId)) {
            TeamEntity team = teamStore.findTeamById(membership.getTeamId()).orElse(null);
            if (team == null || !team.getSharedConnectionIds().contains(connectionId)) {
                continue;
            }
            ConnectionAccessLevel level = levelForMembership(team, membership, connectionId);
            fromTeam = fromTeam == null ? level : fromTeam.restrict(level);
        }

        ConnectionEntity ownedConnection = connectionStore.findConnectionById(connectionId).orElse(null);
        ConnectionAccessLevel fromOwnership = ownedConnection != null
                ? defaultAccessForConnection(userId, ownedConnection)
                : null;

        // Owners keep full DDL on their own connections even when the same id is shared
        // into a team with a tighter member/viewer policy — unless writeGuard is on and
        // there is no UI unlock window (T-SAFE-1). API tokens never see unlock elevation.
        if (fromOwnership == ConnectionAccessLevel.DDL) {
            if (ownedConnection != null
                    && ownedConnection.isWriteGuard()
                    && !writeUnlockService.isUnlockedForCurrentUiSession(userId, connectionId)) {
                return ConnectionAccessLevel.READONLY;
            }
            return ConnectionAccessLevel.DDL;
        }
        if (fromTeam != null) {
            return fromTeam;
        }
        return fromOwnership != null ? fromOwnership : ConnectionAccessLevel.READONLY;
    }

    private static ConnectionAccessLevel defaultAccessForConnection(Long userId, ConnectionEntity connection) {
        // Legacy / unowned connections are read-only until they have an owner or an explicit team share grant.
        if (connection.getUserId() == null) {
            return ConnectionAccessLevel.READONLY;
        }
        if (userId != null && userId.equals(connection.getUserId())) {
            return ConnectionAccessLevel.DDL;
        }
        return ConnectionAccessLevel.READONLY;
    }

    public void requireDmlAccess(Long userId, String connectionId) {
        ConnectionAccessLevel actual = resolveAccess(userId, connectionId);
        if (!actual.allowsDml()) {
            deny(userId, connectionId, "DML", actual, "requireDmlAccess");
        }
        requireEngineFeature(userId, connectionId, "tableDataEdit");
    }

    public void requireDdlAccess(Long userId, String connectionId) {
        ConnectionAccessLevel actual = resolveAccess(userId, connectionId);
        if (!actual.allowsDdl()) {
            deny(userId, connectionId, "DDL", actual, "requireDdlAccess");
        }
        requireEngineFeature(userId, connectionId, "tableStructureEdit");
    }

    /**
     * T-CAP-1 / MetaForge S1: refuse when the product capability matrix says the engine
     * cannot do {@code feature}. Unknown dbTypes (no matrix profile) are fail-open so
     * experimental connectors are not locked out before they are registered.
     */
    public void requireEngineFeature(Long userId, String connectionId, String feature) {
        if (feature == null || feature.isBlank()) {
            return;
        }
        ConnectionEntity connection = connectionStore.findConnectionById(connectionId).orElse(null);
        if (connection == null || connection.getDbType() == null || connection.getDbType().isBlank()) {
            return;
        }
        if (ConnectionCapabilityMatrix.get().profile(connection.getDbType()).isEmpty()) {
            return;
        }
        if (!ConnectionCapabilityMatrix.get().supports(connection.getDbType(), feature)) {
            deny(userId, connectionId, feature, ConnectionAccessLevel.READONLY, "capability:" + feature);
        }
    }

    /** Legacy name: full DDL access required (migrations, etc.). */
    public void requireWriteAccess(Long userId, String connectionId) {
        requireDdlAccess(userId, connectionId);
    }

    /**
     * Catalog metadata writes (reorder / rename / delete / move) need the owner's DDL-level
     * grant but must not consult the engine capability matrix: {@code tableStructureEdit=false}
     * for mongo/redis/kafka/ssh-style connections would otherwise block arranging the tree.
     * Engine capabilities stay enforced on the real SQL/DDL paths via {@link #requireDdlAccess}.
     */
    public void requireCatalogWriteAccess(Long userId, String connectionId) {
        ConnectionAccessLevel actual = resolveAccess(userId, connectionId);
        if (!actual.allowsDdl()) {
            deny(userId, connectionId, "DDL", actual, "requireCatalogWriteAccess");
        }
    }

    public void requireSqlWriteAccess(Long userId, String connectionId, String sql) {
        if (!SqlWriteClassifier.requiresWriteAccess(sql)) {
            return;
        }
        ConnectionAccessLevel level = resolveAccess(userId, connectionId);
        if (SqlWriteClassifier.requiresDdlAccess(sql)) {
            if (!level.allowsDdl()) {
                deny(userId, connectionId, "DDL", level, "requireSqlWriteAccess:ddl");
            }
            requireEngineFeature(userId, connectionId, "tableStructureEdit");
            return;
        }
        if (!level.allowsDml()) {
            deny(userId, connectionId, "DML", level, "requireSqlWriteAccess:dml");
        }
        requireEngineFeature(userId, connectionId, "tableDataEdit");
    }

    private static void deny(
            Long userId,
            String connectionId,
            String requiredAccess,
            ConnectionAccessLevel actualAccess,
            String operation
    ) {
        throw new ConnectionAccessDeniedException(userId, connectionId, requiredAccess, actualAccess, operation);
    }

    public Set<String> listRestrictedConnectionIds(Long userId) {
        Set<String> restricted = new HashSet<>();
        for (TeamMemberEntity membership : teamStore.findMembersByUserId(userId)) {
            TeamEntity team = teamStore.findTeamById(membership.getTeamId()).orElse(null);
            if (team == null) {
                continue;
            }
            for (String connectionId : team.getSharedConnectionIds()) {
                if (!resolveAccess(userId, connectionId).allowsDml()) {
                    restricted.add(connectionId);
                }
            }
        }
        return restricted;
    }

    private ConnectionAccessLevel levelForMembership(
            TeamEntity team,
            TeamMemberEntity member,
            String connectionId
    ) {
        String role = TeamRoleSupport.normalizeRole(member.getRole());
        if (TeamRoleSupport.isViewer(role)) {
            return ConnectionAccessLevel.READONLY;
        }
        if (TeamRoleSupport.canManageTeam(role)) {
            return ConnectionAccessLevel.DDL;
        }
        return ConnectionAccessLevelSupport.fromStored(team.getSharedConnectionAccess().get(connectionId));
    }
}
