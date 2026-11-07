package org.apache.datawise.backend.service.team;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.support.ConnectionAccessLevelSupport;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.configstore.ProjectStore;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.domain.ShareTeamAiSessionRequest;
import org.apache.datawise.backend.domain.TeamSharedAiSessionDetailDto;
import org.apache.datawise.backend.domain.TeamSharedAiSessionDto;
import org.apache.datawise.backend.domain.TeamSummaryDto;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.domain.UpdateOnCallConnectionsRequest;
import org.apache.datawise.backend.model.ProjectEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.model.TeamSharedAiSessionEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class TeamSharingService {

    private static final Logger logger = LoggerFactory.getLogger(TeamSharingService.class);

    private final TeamSupport support;
    private final TeamAuditService auditService;
    private final ObjectMapper objectMapper;
    private final ProjectStore projectStore;

    public TeamSharingService(
                              TeamSupport support,
                              TeamAuditService auditService,
                              ObjectMapper objectMapper,
                              ProjectStore projectStore) {
        this.support = support;
        this.auditService = auditService;
        this.objectMapper = objectMapper;
        this.projectStore = projectStore;
    }

    public TeamSummaryDto updateSharedConnections(String teamId, List<String> connectionIds) {
        return updateSharedConnections(teamId, connectionIds, null);
    }

    public TeamSummaryDto updateSharedConnections(
                                                  String teamId,
                                                  List<String> connectionIds,
                                                  Map<String, String> connectionAccess) {
        return updateTeamSharing(teamId, connectionIds, null, null, connectionAccess);
    }

    public TeamSummaryDto updateSharedConsoles(String teamId, List<String> consoleIds) {
        return updateTeamSharing(teamId, null, consoleIds, null, null);
    }

    public TeamSummaryDto updateShareSqlHistory(String teamId, boolean enabled) {
        return updateTeamSharing(teamId, null, null, enabled, null);
    }

    public TeamSummaryDto updateOnCallConnections(String teamId, UpdateOnCallConnectionsRequest request) {
        Long userId = support.requireUserId();
        TeamMemberEntity actor = support.requireManager(teamId, userId);
        TeamEntity team = support.requireTeam(teamId);
        java.util.Set<String> shared = new HashSet<>(team.getSharedConnectionIds());
        List<String> normalized = new ArrayList<>();
        List<String> requested = request != null && request.connectionIds() != null
                ? request.connectionIds()
                : List.of();
        for (String id : requested) {
            if (id == null || id.isBlank()) {
                continue;
            }
            String trimmed = id.trim();
            if (!shared.contains(trimmed)) {
                throw new IllegalArgumentException("On-call connection must be shared with the team: " + trimmed);
            }
            if (!normalized.contains(trimmed)) {
                normalized.add(trimmed);
            }
        }
        team.setOnCallConnectionIds(normalized);
        support.teamStore().saveTeam(team);
        auditService.audit(teamId, userId, "sharing.onCall", "Updated on-call connections (" + normalized.size() + ")");
        return support.toSummary(team, actor.getRole());
    }

    /**
     * 空列表 = 不限制；非空 = 仅这些项目（default 项目由 listProjects 过滤侧始终保留）。
     */
    public TeamSummaryDto updateVisibleProjects(String teamId, List<String> projectIds) {
        Long userId = support.requireUserId();
        TeamMemberEntity actor = support.requireManager(teamId, userId);
        TeamEntity team = support.requireTeam(teamId);
        String tenantId = TenantIds.normalizeOrDefault(team.getTenantId());
        Set<String> known = projectStore.listProjects(tenantId).stream()
                .map(ProjectEntity::getId)
                .collect(Collectors.toCollection(HashSet::new));
        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        List<String> requested = projectIds != null ? projectIds : List.of();
        for (String id : requested) {
            if (id == null || id.isBlank()) {
                continue;
            }
            String trimmed = ProjectIds.normalizeOrDefault(id.trim());
            if (!known.contains(trimmed)) {
                throw new IllegalArgumentException("PROJECT_NOT_FOUND");
            }
            normalized.add(trimmed);
        }
        team.setVisibleProjectIds(new ArrayList<>(normalized));
        support.teamStore().saveTeam(team);
        auditService.audit(
                teamId,
                userId,
                "sharing.visibleProjects",
                normalized.isEmpty()
                        ? "Cleared visible project restriction"
                        : "Updated visible projects (" + normalized.size() + ")");
        return support.toSummary(team, actor.getRole());
    }

    public TeamSharedAiSessionDto shareAiSession(String teamId, ShareTeamAiSessionRequest request) {
        Long userId = support.requireUserId();
        support.requireMember(teamId, userId);
        if (request.payloadJson() == null || request.payloadJson().isBlank()) {
            throw new IllegalArgumentException("payloadJson is required");
        }
        String title = request.title() != null && !request.title().isBlank()
                ? request.title().trim()
                : "Shared AI session";
        TeamSharedAiSessionEntity entity = new TeamSharedAiSessionEntity();
        entity.setId(IdGenerator.shortId("ais-"));
        entity.setTeamId(teamId);
        entity.setTitle(title);
        entity.setSharedByUserId(userId);
        entity.setSharedAt(Instant.now());
        entity.setPayloadJson(request.payloadJson());
        support.teamStore().saveSharedAiSession(entity);
        auditService.audit(teamId, userId, "ai.session.share", "Shared AI session \"" + title + "\"");
        return toSharedAiSessionDto(entity);
    }

    public List<TeamSharedAiSessionDto> listSharedAiSessions(String teamId) {
        support.requireMember(teamId, support.requireUserId());
        return support.teamStore().findSharedAiSessionsByTeamId(teamId).stream()
                .map(this::toSharedAiSessionDto)
                .toList();
    }

    public TeamSharedAiSessionDetailDto getSharedAiSession(String teamId, String sessionId) {
        support.requireMember(teamId, support.requireUserId());
        TeamSharedAiSessionEntity entity = support.teamStore().findSharedAiSessionById(teamId, sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Shared AI session not found"));
        return new TeamSharedAiSessionDetailDto(
                entity.getId(),
                entity.getTeamId(),
                entity.getTitle(),
                support.resolveUserName(entity.getSharedByUserId()),
                TeamSupport.formatInstant(entity.getSharedAt()),
                entity.getPayloadJson());
    }

    private TeamSummaryDto updateTeamSharing(
                                             String teamId,
                                             List<String> connectionIds,
                                             List<String> consoleIds,
                                             Boolean shareSqlHistory,
                                             Map<String, String> connectionAccess) {
        Long userId = support.requireUserId();
        TeamMemberEntity actor = support.requireManager(teamId, userId);
        TeamEntity team = support.requireTeam(teamId);
        if (connectionIds != null) {
            team.setSharedConnectionIds(new ArrayList<>(connectionIds));
            if (connectionAccess != null) {
                Map<String, String> normalized = new java.util.LinkedHashMap<>();
                for (String id : connectionIds) {
                    String stored = ConnectionAccessLevelSupport.normalizeStored(connectionAccess.get(id));
                    if (ConnectionAccessLevelSupport.shouldPersist(stored)) {
                        normalized.put(id, stored);
                    }
                }
                team.setSharedConnectionAccess(normalized);
            } else {
                Map<String, String> pruned = new java.util.LinkedHashMap<>();
                for (String id : connectionIds) {
                    String existing = team.getSharedConnectionAccess().get(id);
                    String stored = ConnectionAccessLevelSupport.normalizeStored(existing);
                    if (ConnectionAccessLevelSupport.shouldPersist(stored)) {
                        pruned.put(id, stored);
                    }
                }
                team.setSharedConnectionAccess(pruned);
            }
            java.util.Set<String> allowed = new HashSet<>(connectionIds);
            team.setOnCallConnectionIds(
                    team.getOnCallConnectionIds().stream().filter(allowed::contains).toList());
            auditService.audit(teamId, userId, "sharing.connections",
                    "Updated shared connections (" + connectionIds.size() + ")");
        }
        if (consoleIds != null) {
            team.setSharedConsoleIds(new ArrayList<>(consoleIds));
            auditService.audit(teamId, userId, "sharing.consoles",
                    "Updated shared consoles (" + consoleIds.size() + ")");
        }
        if (shareSqlHistory != null) {
            team.setShareSqlHistory(shareSqlHistory);
            auditService.audit(teamId, userId, "sharing.sqlHistory", "shareSqlHistory=" + shareSqlHistory);
        }
        support.teamStore().saveTeam(team);
        return support.toSummary(team, actor.getRole());
    }

    private TeamSharedAiSessionDto toSharedAiSessionDto(TeamSharedAiSessionEntity entity) {
        return new TeamSharedAiSessionDto(
                entity.getId(),
                entity.getTeamId(),
                entity.getTitle(),
                support.resolveUserName(entity.getSharedByUserId()),
                TeamSupport.formatInstant(entity.getSharedAt()),
                countSharedMessages(entity.getPayloadJson()));
    }

    private int countSharedMessages(String payloadJson) {
        if (payloadJson == null || payloadJson.isBlank()) {
            return 0;
        }
        try {
            JsonNode root = objectMapper.readTree(payloadJson);
            JsonNode messages = root.get("messages");
            return messages != null && messages.isArray() ? messages.size() : 0;
        } catch (Exception ex) {
            ExceptionLogging.recoverable(logger, "Failed to count shared AI session messages", ex);
            return 0;
        }
    }
}
