package org.apache.datawise.backend.service;

import org.apache.datawise.backend.common.support.ConnectionsXmlCodec;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.SessionEphemeralCatalogStore;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.domain.ProjectConnectionMembership;
import org.apache.datawise.backend.domain.ProjectRequestContext;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.project.ProjectService;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * 连接 catalog 可见性：注册用户按 owner / legacy / 团队共享；访客仅会话临时 catalog。
 * 默认按活动项目过滤（{@code scope=all} 可看全部项目）。
 */
@Service
public class ConnectionVisibilityService {

    private final ConnectionStore connectionStore;
    private final SessionEphemeralCatalogStore ephemeralCatalogStore;
    private final TeamStore teamStore;
    private final ProjectService projectService;

    public ConnectionVisibilityService(
                                       ConnectionStore connectionStore,
                                       SessionEphemeralCatalogStore ephemeralCatalogStore,
                                       TeamStore teamStore,
                                       ProjectService projectService) {
        this.connectionStore = connectionStore;
        this.ephemeralCatalogStore = ephemeralCatalogStore;
        this.teamStore = teamStore;
        this.projectService = projectService;
    }

    public record VisibleCatalog(List<ConnectionGroupEntity> groups, List<ConnectionEntity> connections) {
    }

    public VisibleCatalog visibleCatalogForCurrentUser() {
        if (UserContext.isGuest()) {
            ConnectionsXmlCodec.ParsedCatalog catalog = ephemeralCatalogStore.getCatalog(UserContext.getSessionId());
            return new VisibleCatalog(catalog.groups(), catalog.connections());
        }
        return visibleCatalogForUser(UserContext.requireUserId());
    }

    public VisibleCatalog visibleCatalogForUser(long userId) {
        Set<String> teamSharedConnectionIds = teamSharedConnectionIds(userId);
        List<ConnectionEntity> visibleConnections = connectionStore.findAllConnections().stream()
                .filter(connection -> isConnectionVisible(connection, userId, teamSharedConnectionIds))
                .sorted(Comparator.comparingInt(ConnectionEntity::getSortOrder))
                .toList();

        String activeProjectId = null;
        if (!ProjectRequestContext.isScopeAll()) {
            activeProjectId = projectService.resolveActiveProjectId();
            String projectId = activeProjectId;
            visibleConnections = visibleConnections.stream()
                    .filter(connection -> ProjectConnectionMembership.belongsToProject(connection, projectId))
                    .toList();
        }

        Set<String> requiredGroupIds = new HashSet<>();
        for (ConnectionEntity connection : visibleConnections) {
            if (connection.getGroupId() != null) {
                requiredGroupIds.add(connection.getGroupId());
            }
        }

        Map<String, ConnectionGroupEntity> groupsById = new LinkedHashMap<>();
        for (ConnectionGroupEntity group : connectionStore.findAllGroups()) {
            if (activeProjectId != null) {
                boolean sameProject = activeProjectId.equals(ProjectIds.normalizeOrDefault(group.getProjectId()));
                if (!sameProject && !requiredGroupIds.contains(group.getId())) {
                    continue;
                }
            }
            groupsById.put(group.getId(), group);
        }
        // Ensure ancestor groups for required ids are present even if other-project
        if (activeProjectId != null) {
            Map<String, ConnectionGroupEntity> allGroups = new LinkedHashMap<>();
            for (ConnectionGroupEntity group : connectionStore.findAllGroups()) {
                allGroups.put(group.getId(), group);
            }
            Set<String> withAncestors = new HashSet<>(groupsById.keySet());
            for (String groupId : requiredGroupIds) {
                includeGroupChain(groupId, allGroups, withAncestors);
            }
            for (String id : withAncestors) {
                ConnectionGroupEntity g = allGroups.get(id);
                if (g != null) {
                    groupsById.putIfAbsent(id, g);
                }
            }
        }

        Set<String> includedGroupIds = new HashSet<>();
        for (ConnectionGroupEntity group : groupsById.values()) {
            if (isGroupVisible(group, userId, requiredGroupIds, groupsById)) {
                includeGroupChain(group.getId(), groupsById, includedGroupIds);
            }
        }

        List<ConnectionGroupEntity> visibleGroups = groupsById.values().stream()
                .filter(group -> includedGroupIds.contains(group.getId()))
                .sorted(Comparator.comparingInt(ConnectionGroupEntity::getSortOrder))
                .toList();

        return new VisibleCatalog(visibleGroups, visibleConnections);
    }

    public Optional<ConnectionEntity> resolveConnectionEntity(String connectionId) {
        if (connectionId == null || connectionId.isBlank()) {
            return Optional.empty();
        }
        if (UserContext.isGuest()) {
            return ephemeralCatalogStore.findConnectionById(UserContext.getSessionId(), connectionId);
        }
        return resolveConnectionEntity(connectionId, UserContext.requireUserId());
    }

    /** WebSocket 等无 HTTP {@link UserContext} 的场景使用。 */
    public Optional<ConnectionEntity> resolveConnectionEntity(String connectionId, long userId) {
        if (connectionId == null || connectionId.isBlank()) {
            return Optional.empty();
        }
        Set<String> teamSharedConnectionIds = teamSharedConnectionIds(userId);
        return connectionStore.findConnectionById(connectionId)
                .filter(connection -> isConnectionVisible(connection, userId, teamSharedConnectionIds))
                .filter(this::belongsToActiveProjectScope);
    }

    /**
     * 非 {@code scope=all} 时，按活动项目隔离连接解析（Explorer / SQL / 中间件入口共用）。
     */
    private boolean belongsToActiveProjectScope(ConnectionEntity connection) {
        if (ProjectRequestContext.isScopeAll()) {
            return true;
        }
        String activeProjectId = projectService.resolveActiveProjectId();
        return ProjectConnectionMembership.belongsToProject(connection, activeProjectId);
    }

    public boolean isConnectionVisibleToCurrentUser(String connectionId) {
        return resolveConnectionEntity(connectionId).isPresent();
    }

    public boolean isEphemeralConnection(String connectionId) {
        if (!UserContext.isGuest()) {
            return false;
        }
        return ephemeralCatalogStore.findConnectionById(UserContext.getSessionId(), connectionId).isPresent();
    }

    public Optional<ConnectionGroupEntity> resolveGroupEntity(String groupId) {
        if (groupId == null || groupId.isBlank()) {
            return Optional.empty();
        }
        if (UserContext.isGuest()) {
            return ephemeralCatalogStore.findGroupById(UserContext.getSessionId(), groupId);
        }
        VisibleCatalog catalog = visibleCatalogForCurrentUser();
        return catalog.groups().stream()
                .filter(group -> groupId.equals(group.getId()))
                .findFirst();
    }

    public String defaultGroupIdForCurrentUser() {
        if (UserContext.isGuest()) {
            String sessionId = UserContext.getSessionId();
            if (sessionId == null || sessionId.isBlank()) {
                throw new UnauthorizedException();
            }
            return ephemeralCatalogStore.ensureDefaultGroupId(sessionId);
        }
        List<ConnectionGroupEntity> roots = visibleCatalogForCurrentUser().groups().stream()
                .filter(group -> group.getParentId() == null)
                .sorted(Comparator.comparingInt(ConnectionGroupEntity::getSortOrder))
                .toList();
        if (roots.isEmpty()) {
            return null;
        }
        return roots.get(0).getId();
    }

    public List<ConnectionEntity> connectionsForGroup(String groupId) {
        if (UserContext.isGuest()) {
            return ephemeralCatalogStore.findConnectionsByGroupId(UserContext.getSessionId(), groupId);
        }
        return visibleCatalogForCurrentUser().connections().stream()
                .filter(connection -> groupId.equals(connection.getGroupId()))
                .toList();
    }

    public boolean canMutateConnection(long userId, String connectionId) {
        if (UserContext.isGuest()) {
            return isEphemeralConnection(connectionId);
        }
        Optional<ConnectionEntity> entity = connectionStore.findConnectionById(connectionId);
        if (entity.isEmpty()) {
            return false;
        }
        ConnectionEntity connection = entity.get();
        if (connection.getUserId() == null) {
            return false;
        }
        return userId == connection.getUserId();
    }

    private boolean isConnectionVisible(ConnectionEntity connection, long userId, Set<String> teamSharedConnectionIds) {
        if (!belongsToCurrentTenant(connection.getTenantId())) {
            return false;
        }
        if (connection.getUserId() != null && connection.getUserId().equals(userId)) {
            return true;
        }
        if (connection.getUserId() == null) {
            return true;
        }
        return teamSharedConnectionIds.contains(connection.getId());
    }

    private boolean belongsToCurrentTenant(String tenantId) {
        String current = UserContext.getTenantId();
        String normalized = (tenantId == null || tenantId.isBlank())
                ? org.apache.datawise.backend.domain.TenantIds.DEFAULT
                : tenantId.trim();
        return org.apache.datawise.backend.domain.TenantIds.normalizeOrDefault(current).equals(normalized);
    }

    private boolean isGroupVisible(
                                   ConnectionGroupEntity group,
                                   long userId,
                                   Set<String> requiredGroupIds,
                                   Map<String, ConnectionGroupEntity> groupsById) {
        if (requiredGroupIds.contains(group.getId())) {
            return true;
        }
        if (group.getUserId() != null && group.getUserId().equals(userId)) {
            return true;
        }
        if (group.getUserId() == null) {
            return requiredGroupIds.contains(group.getId())
                    || hasVisibleDescendant(group.getId(), requiredGroupIds, groupsById);
        }
        return false;
    }

    private boolean hasVisibleDescendant(
                                         String groupId,
                                         Set<String> requiredGroupIds,
                                         Map<String, ConnectionGroupEntity> groupsById) {
        for (ConnectionGroupEntity candidate : groupsById.values()) {
            if (groupId.equals(candidate.getParentId())
                    && (requiredGroupIds.contains(candidate.getId())
                            || hasVisibleDescendant(candidate.getId(), requiredGroupIds, groupsById))) {
                return true;
            }
        }
        return false;
    }

    private void includeGroupChain(
                                   String groupId,
                                   Map<String, ConnectionGroupEntity> groupsById,
                                   Set<String> includedGroupIds) {
        if (groupId == null || includedGroupIds.contains(groupId)) {
            return;
        }
        includedGroupIds.add(groupId);
        ConnectionGroupEntity group = groupsById.get(groupId);
        if (group != null && group.getParentId() != null) {
            includeGroupChain(group.getParentId(), groupsById, includedGroupIds);
        }
    }

    private Set<String> teamSharedConnectionIds(long userId) {
        Set<String> shared = new HashSet<>();
        for (TeamMemberEntity membership : teamStore.findMembersByUserId(userId)) {
            TeamEntity team = teamStore.findTeamById(membership.getTeamId()).orElse(null);
            if (team == null || !belongsToCurrentTenant(team.getTenantId())) {
                continue;
            }
            shared.addAll(team.getSharedConnectionIds());
        }
        return shared;
    }
}
