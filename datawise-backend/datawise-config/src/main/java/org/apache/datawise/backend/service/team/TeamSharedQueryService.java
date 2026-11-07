package org.apache.datawise.backend.service.team;

import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.common.support.TeamRoleSupport;
import org.apache.datawise.backend.domain.AddTeamSharedQueryCommentRequest;
import org.apache.datawise.backend.domain.ShareTeamSharedQueryRequest;
import org.apache.datawise.backend.domain.TeamSharedQueryCommentDto;
import org.apache.datawise.backend.domain.TeamSharedQueryDetailDto;
import org.apache.datawise.backend.domain.TeamSharedQuerySummaryDto;
import org.apache.datawise.backend.domain.TeamSharedQueryUpdatedEvent;
import org.apache.datawise.backend.domain.UpdateTeamSharedQueryRequest;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.model.TeamSharedQueryCommentEntity;
import org.apache.datawise.backend.model.TeamSharedQueryEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class TeamSharedQueryService {

    private final TeamSupport support;
    private final TeamAuditService auditService;
    private final TeamSharedQueryStreamHub streamHub;

    public TeamSharedQueryService(
                                  TeamSupport support,
                                  TeamAuditService auditService,
                                  TeamSharedQueryStreamHub streamHub) {
        this.support = support;
        this.auditService = auditService;
        this.streamHub = streamHub;
    }

    public TeamSharedQuerySummaryDto shareQuery(String teamId, ShareTeamSharedQueryRequest request) {
        Long userId = support.requireUserId();
        support.requireMember(teamId, userId);
        if (request.title() == null || request.title().isBlank()) {
            throw new IllegalArgumentException("title is required");
        }
        if (request.sql() == null || request.sql().isBlank()) {
            throw new IllegalArgumentException("sql is required");
        }
        Instant now = Instant.now();
        TeamSharedQueryEntity entity = new TeamSharedQueryEntity();
        entity.setId(IdGenerator.shortId("tq-"));
        entity.setTeamId(teamId);
        entity.setTitle(request.title().trim());
        entity.setDescription(TeamSupport.trimToNull(request.description()));
        entity.setConnectionId(TeamSupport.trimToNull(request.connectionId()));
        entity.setConnectionName(TeamSupport.trimToNull(request.connectionName()));
        entity.setDatabase(TeamSupport.trimToNull(request.database()));
        entity.setSql(request.sql().trim());
        entity.setTags(new ArrayList<>(request.tags()));
        entity.setSharedByUserId(userId);
        entity.setSharedAt(now);
        entity.setUpdatedAt(now);
        support.teamStore().saveSharedQuery(entity);
        auditService.audit(teamId, userId, "query.share", "Shared query \"" + entity.getTitle() + "\"");
        return toSharedQuerySummaryDto(entity, userId);
    }

    public List<TeamSharedQuerySummaryDto> listSharedQueries(String teamId) {
        Long userId = support.requireUserId();
        support.requireMember(teamId, userId);
        return support.teamStore().findSharedQueriesByTeamId(teamId).stream()
                .map(entity -> toSharedQuerySummaryDto(entity, userId))
                .toList();
    }

    public TeamSharedQueryDetailDto getSharedQuery(String teamId, String queryId) {
        Long userId = support.requireUserId();
        support.requireMember(teamId, userId);
        TeamSharedQueryEntity entity = support.teamStore().findSharedQueryById(teamId, queryId)
                .orElseThrow(() -> new IllegalArgumentException("Shared query not found"));
        return toSharedQueryDetailDto(entity, userId);
    }

    public SseEmitter openSharedQueryStream(String teamId, String queryId) {
        Long userId = support.requireUserId();
        support.requireMember(teamId, userId);
        TeamSharedQueryEntity entity = support.teamStore().findSharedQueryById(teamId, queryId)
                .orElseThrow(() -> new IllegalArgumentException("Shared query not found"));
        SseEmitter emitter = streamHub.createEmitter();
        streamHub.subscribe(
                teamId,
                queryId,
                emitter,
                userId,
                support.resolveUserName(userId));
        streamHub.sendConnected(
                emitter,
                teamId,
                queryId,
                TeamSupport.formatInstant(entity.getUpdatedAt()));
        return emitter;
    }

    public TeamSharedQuerySummaryDto updateSharedQuery(
                                                       String teamId,
                                                       String queryId,
                                                       UpdateTeamSharedQueryRequest request) {
        Long userId = support.requireUserId();
        support.requireMember(teamId, userId);
        TeamSharedQueryEntity entity = support.teamStore().findSharedQueryById(teamId, queryId)
                .orElseThrow(() -> new IllegalArgumentException("Shared query not found"));
        requireQueryOwnerOrManager(entity, teamId, userId);
        if (request.title() == null || request.title().isBlank()) {
            throw new IllegalArgumentException("title is required");
        }
        if (request.sql() == null || request.sql().isBlank()) {
            throw new IllegalArgumentException("sql is required");
        }
        if (request.expectedUpdatedAt() != null && !request.expectedUpdatedAt().isBlank()) {
            String currentUpdatedAt = TeamSupport.formatInstant(entity.getUpdatedAt());
            if (currentUpdatedAt == null || !request.expectedUpdatedAt().trim().equals(currentUpdatedAt)) {
                throw new IllegalArgumentException("Shared query has been updated by others; pull latest first");
            }
        }
        entity.setTitle(request.title().trim());
        entity.setDescription(TeamSupport.trimToNull(request.description()));
        entity.setConnectionId(TeamSupport.trimToNull(request.connectionId()));
        entity.setConnectionName(TeamSupport.trimToNull(request.connectionName()));
        entity.setDatabase(TeamSupport.trimToNull(request.database()));
        entity.setSql(request.sql().trim());
        entity.setTags(new ArrayList<>(request.tags()));
        entity.setUpdatedAt(Instant.now());
        support.teamStore().saveSharedQuery(entity);
        auditService.audit(teamId, userId, "query.update", "Updated query \"" + entity.getTitle() + "\"");
        streamHub.publishUpdated(new TeamSharedQueryUpdatedEvent(
                teamId,
                queryId,
                TeamSupport.formatInstant(entity.getUpdatedAt()),
                userId,
                support.resolveUserName(userId)));
        return toSharedQuerySummaryDto(entity, userId);
    }

    public void deleteSharedQuery(String teamId, String queryId) {
        Long userId = support.requireUserId();
        support.requireMember(teamId, userId);
        TeamSharedQueryEntity entity = support.teamStore().findSharedQueryById(teamId, queryId)
                .orElseThrow(() -> new IllegalArgumentException("Shared query not found"));
        requireQueryOwnerOrManager(entity, teamId, userId);
        support.teamStore().deleteSharedQuery(teamId, queryId);
        auditService.audit(teamId, userId, "query.delete", "Deleted query \"" + entity.getTitle() + "\"");
    }

    public TeamSharedQueryCommentDto addSharedQueryComment(
                                                           String teamId,
                                                           String queryId,
                                                           AddTeamSharedQueryCommentRequest request) {
        Long userId = support.requireUserId();
        support.requireMember(teamId, userId);
        if (request.content() == null || request.content().isBlank()) {
            throw new IllegalArgumentException("content is required");
        }
        TeamSharedQueryEntity entity = support.teamStore().findSharedQueryById(teamId, queryId)
                .orElseThrow(() -> new IllegalArgumentException("Shared query not found"));
        TeamSharedQueryCommentEntity comment = new TeamSharedQueryCommentEntity();
        comment.setId(IdGenerator.shortId("tqc-"));
        comment.setUserId(userId);
        comment.setContent(request.content().trim());
        comment.setCreatedAt(Instant.now());
        entity.getComments().add(comment);
        entity.setUpdatedAt(Instant.now());
        support.teamStore().saveSharedQuery(entity);
        auditService.audit(teamId, userId, "query.comment", "Comment on query \"" + entity.getTitle() + "\"");
        return toCommentDto(comment);
    }

    public void deleteSharedQueryComment(String teamId, String queryId, String commentId) {
        Long userId = support.requireUserId();
        support.requireMember(teamId, userId);
        TeamSharedQueryEntity entity = support.teamStore().findSharedQueryById(teamId, queryId)
                .orElseThrow(() -> new IllegalArgumentException("Shared query not found"));
        TeamSharedQueryCommentEntity comment = entity.getComments().stream()
                .filter(item -> commentId.equals(item.getId()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Comment not found"));
        requireCommentDeletePermission(entity, comment, teamId, userId);
        entity.getComments().removeIf(item -> commentId.equals(item.getId()));
        entity.setUpdatedAt(Instant.now());
        support.teamStore().saveSharedQuery(entity);
        auditService.audit(teamId, userId, "query.comment.delete", "Deleted comment on query \"" + entity.getTitle() + "\"");
    }

    public TeamSharedQuerySummaryDto toggleSharedQueryFavorite(String teamId, String queryId) {
        Long userId = support.requireUserId();
        support.requireMember(teamId, userId);
        TeamSharedQueryEntity entity = support.teamStore().findSharedQueryById(teamId, queryId)
                .orElseThrow(() -> new IllegalArgumentException("Shared query not found"));
        List<Long> favorites = entity.getFavoriteUserIds();
        if (favorites.contains(userId)) {
            favorites.remove(userId);
            auditService.audit(teamId, userId, "query.unfavorite", "Unfavorited query \"" + entity.getTitle() + "\"");
        } else {
            favorites.add(userId);
            auditService.audit(teamId, userId, "query.favorite", "Favorited query \"" + entity.getTitle() + "\"");
        }
        support.teamStore().saveSharedQuery(entity);
        return toSharedQuerySummaryDto(entity, userId);
    }

    private void requireCommentDeletePermission(
                                                TeamSharedQueryEntity entity,
                                                TeamSharedQueryCommentEntity comment,
                                                String teamId,
                                                Long userId) {
        if (userId.equals(comment.getUserId())) {
            return;
        }
        if (userId.equals(entity.getSharedByUserId())) {
            return;
        }
        TeamMemberEntity member = support.requireMember(teamId, userId);
        if (TeamRoleSupport.canManageTeam(member.getRole())) {
            return;
        }
        throw new IllegalArgumentException("Insufficient permission to delete comment");
    }

    private void requireQueryOwnerOrManager(TeamSharedQueryEntity entity, String teamId, Long userId) {
        if (userId.equals(entity.getSharedByUserId())) {
            return;
        }
        TeamMemberEntity member = support.requireMember(teamId, userId);
        if (TeamRoleSupport.canManageTeam(member.getRole())) {
            return;
        }
        throw new IllegalArgumentException("Insufficient permission to modify shared query");
    }

    private TeamSharedQuerySummaryDto toSharedQuerySummaryDto(TeamSharedQueryEntity entity, Long currentUserId) {
        List<TeamSharedQueryCommentEntity> comments = entity.getComments() != null ? entity.getComments() : List.of();
        List<Long> favoriteUserIds = entity.getFavoriteUserIds() != null ? entity.getFavoriteUserIds() : List.of();
        return new TeamSharedQuerySummaryDto(
                entity.getId(),
                entity.getTeamId(),
                entity.getTitle(),
                entity.getDescription(),
                entity.getConnectionId(),
                entity.getConnectionName(),
                entity.getDatabase(),
                List.copyOf(entity.getTags()),
                support.resolveUserName(entity.getSharedByUserId()),
                entity.getSharedByUserId(),
                TeamSupport.formatInstant(entity.getSharedAt()),
                TeamSupport.formatInstant(entity.getUpdatedAt()),
                comments.size(),
                favoriteUserIds.size(),
                currentUserId != null && favoriteUserIds.contains(currentUserId));
    }

    private TeamSharedQueryDetailDto toSharedQueryDetailDto(TeamSharedQueryEntity entity, Long currentUserId) {
        List<TeamSharedQueryCommentEntity> comments = entity.getComments() != null ? entity.getComments() : List.of();
        List<Long> favoriteUserIds = entity.getFavoriteUserIds() != null ? entity.getFavoriteUserIds() : List.of();
        List<TeamSharedQueryCommentDto> commentDtos = comments.stream()
                .sorted(Comparator.comparing(
                        TeamSharedQueryCommentEntity::getCreatedAt,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .map(this::toCommentDto)
                .toList();
        return new TeamSharedQueryDetailDto(
                entity.getId(),
                entity.getTeamId(),
                entity.getTitle(),
                entity.getDescription(),
                entity.getConnectionId(),
                entity.getConnectionName(),
                entity.getDatabase(),
                entity.getSql(),
                List.copyOf(entity.getTags()),
                support.resolveUserName(entity.getSharedByUserId()),
                entity.getSharedByUserId(),
                TeamSupport.formatInstant(entity.getSharedAt()),
                TeamSupport.formatInstant(entity.getUpdatedAt()),
                favoriteUserIds.size(),
                currentUserId != null && favoriteUserIds.contains(currentUserId),
                commentDtos);
    }

    private TeamSharedQueryCommentDto toCommentDto(TeamSharedQueryCommentEntity comment) {
        return new TeamSharedQueryCommentDto(
                comment.getId(),
                comment.getUserId(),
                support.resolveUserName(comment.getUserId()),
                comment.getContent(),
                TeamSupport.formatInstant(comment.getCreatedAt()));
    }
}
