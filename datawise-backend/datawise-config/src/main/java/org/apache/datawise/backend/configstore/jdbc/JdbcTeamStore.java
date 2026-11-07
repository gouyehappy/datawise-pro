package org.apache.datawise.backend.configstore.jdbc;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.configstore.TenantScopedConfigSupport;
import org.apache.datawise.backend.configstore.support.TeamAuditLogFilters;
import org.apache.datawise.backend.configstore.team.TeamSnapshot;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.TeamAuditLogEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamInviteEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.model.TeamProductionApprovalEntity;
import org.apache.datawise.backend.model.TeamSharedAiSessionEntity;
import org.apache.datawise.backend.model.TeamSharedQueryEntity;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Team catalog backed by {@code dw_team_snapshots} (one JSON payload per tenant).
 */
@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "jdbc")
public class JdbcTeamStore implements TeamStore {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final ConcurrentHashMap<String, TenantTeamState> byTenant = new ConcurrentHashMap<>();

    public JdbcTeamStore(
                         @Qualifier(MetadataJdbcConfiguration.METADATA_JDBC) JdbcTemplate jdbc,
                         ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        stateFor(TenantIds.DEFAULT);
    }

    @Override
    public void ensureTenantFiles(String tenantId) {
        TenantTeamState state = stateFor(tenantId);
        if (!snapshotExists(TenantIds.normalizeOrDefault(tenantId))) {
            state.persist();
        }
    }

    private TenantTeamState stateForCurrent() {
        return stateFor(TenantScopedConfigSupport.currentTenantId());
    }

    private TenantTeamState stateFor(String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        return byTenant.computeIfAbsent(id, this::loadState);
    }

    private TenantTeamState loadState(String tenantId) {
        TenantTeamState state = new TenantTeamState(tenantId);
        state.reload();
        return state;
    }

    private boolean snapshotExists(String tenantId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM dw_team_snapshots WHERE tenant_id = ?",
                Integer.class,
                tenantId);
        return count != null && count > 0;
    }

    @Override
    public List<TeamMemberEntity> findMembersByUserId(Long userId) {
        return stateForCurrent().members.stream().filter(member -> userId.equals(member.getUserId())).toList();
    }

    @Override
    public List<TeamMemberEntity> findMembersByTeamId(String teamId) {
        return stateForCurrent().members.stream().filter(member -> teamId.equals(member.getTeamId())).toList();
    }

    @Override
    public Optional<TeamMemberEntity> findMember(String teamId, Long userId) {
        return stateForCurrent().members.stream()
                .filter(member -> teamId.equals(member.getTeamId()) && userId.equals(member.getUserId()))
                .findFirst();
    }

    @Override
    public Optional<TeamEntity> findTeamById(String teamId) {
        return stateForCurrent().teams.stream().filter(team -> teamId.equals(team.getId())).findFirst();
    }

    @Override
    public List<TeamEntity> listAllTeams() {
        return List.copyOf(stateForCurrent().teams);
    }

    @Override
    public long countMembersByTeamId(String teamId) {
        return stateForCurrent().members.stream().filter(member -> teamId.equals(member.getTeamId())).count();
    }

    @Override
    public synchronized TeamEntity saveTeam(TeamEntity team) {
        TenantTeamState state = stateForCurrent();
        state.teams.removeIf(existing -> existing.getId().equals(team.getId()));
        state.teams.add(team);
        state.persist();
        return team;
    }

    @Override
    public synchronized TeamMemberEntity saveMember(TeamMemberEntity member) {
        TenantTeamState state = stateForCurrent();
        state.members.removeIf(existing -> existing.getTeamId().equals(member.getTeamId()) && existing.getUserId().equals(member.getUserId()));
        state.members.add(member);
        state.persist();
        return member;
    }

    @Override
    public synchronized void removeMember(String teamId, Long userId) {
        TenantTeamState state = stateForCurrent();
        state.members.removeIf(member -> teamId.equals(member.getTeamId()) && userId.equals(member.getUserId()));
        state.persist();
    }

    @Override
    public List<TeamInviteEntity> findInvitesByTeamId(String teamId) {
        return stateForCurrent().invites.stream()
                .filter(invite -> teamId.equals(invite.getTeamId()))
                .sorted(Comparator.comparing(TeamInviteEntity::getRequestedAt).reversed())
                .toList();
    }

    @Override
    public Optional<TeamInviteEntity> findInviteById(String inviteId) {
        return stateForCurrent().invites.stream().filter(invite -> inviteId.equals(invite.getId())).findFirst();
    }

    @Override
    public Optional<TeamInviteEntity> findPendingInvite(String teamId, Long userId) {
        return stateForCurrent().invites.stream()
                .filter(invite -> teamId.equals(invite.getTeamId())
                        && userId.equals(invite.getUserId())
                        && "pending".equalsIgnoreCase(invite.getStatus()))
                .findFirst();
    }

    @Override
    public List<TeamInviteEntity> findInvitesByUserId(Long userId) {
        return stateForCurrent().invites.stream()
                .filter(invite -> userId.equals(invite.getUserId()))
                .sorted(Comparator.comparing(TeamInviteEntity::getRequestedAt).reversed())
                .toList();
    }

    @Override
    public long countPendingInvitesByTeamId(String teamId) {
        return stateForCurrent().invites.stream()
                .filter(invite -> teamId.equals(invite.getTeamId())
                        && "pending".equalsIgnoreCase(invite.getStatus()))
                .count();
    }

    @Override
    public synchronized TeamInviteEntity saveInvite(TeamInviteEntity invite) {
        TenantTeamState state = stateForCurrent();
        state.invites.removeIf(existing -> existing.getId().equals(invite.getId()));
        state.invites.add(invite);
        state.persist();
        return invite;
    }

    @Override
    public List<TeamAuditLogEntity> findAuditLogsByTeamId(String teamId, int limit) {
        return findAuditLogsByTeamId(teamId, limit, null, null, null);
    }

    @Override
    public List<TeamAuditLogEntity> findAuditLogsByTeamId(
                                                          String teamId,
                                                          int limit,
                                                          Long actorUserId,
                                                          Instant since,
                                                          Instant until) {
        return stateForCurrent().auditLogs.stream()
                .filter(log -> teamId.equals(log.getTeamId()))
                .filter(log -> TeamAuditLogFilters.matches(log, actorUserId, since, until))
                .sorted(Comparator.comparing(TeamAuditLogEntity::getCreatedAt).reversed())
                .limit(Math.max(1, Math.min(limit, 500)))
                .toList();
    }

    @Override
    public synchronized TeamAuditLogEntity appendAuditLog(TeamAuditLogEntity log) {
        TenantTeamState state = stateForCurrent();
        state.auditLogs.add(log);
        while (state.auditLogs.size() > 500) {
            state.auditLogs.remove(0);
        }
        state.persist();
        return log;
    }

    @Override
    public Optional<TeamEntity> findTeamByInviteCode(String code) {
        if (code == null || code.isBlank()) {
            return Optional.empty();
        }
        String normalized = code.trim();
        return stateForCurrent().teams.stream()
                .filter(team -> team.getInviteCode() != null && team.getInviteCode().equalsIgnoreCase(normalized))
                .findFirst();
    }

    @Override
    public synchronized TeamSharedAiSessionEntity saveSharedAiSession(TeamSharedAiSessionEntity session) {
        TenantTeamState state = stateForCurrent();
        state.sharedAiSessions.removeIf(existing -> existing.getId().equals(session.getId()));
        state.sharedAiSessions.add(session);
        while (state.sharedAiSessions.size() > 200) {
            state.sharedAiSessions.remove(0);
        }
        state.persist();
        return session;
    }

    @Override
    public List<TeamSharedAiSessionEntity> findSharedAiSessionsByTeamId(String teamId) {
        return stateForCurrent().sharedAiSessions.stream()
                .filter(session -> teamId.equals(session.getTeamId()))
                .sorted(Comparator.comparing(TeamSharedAiSessionEntity::getSharedAt).reversed())
                .toList();
    }

    @Override
    public Optional<TeamSharedAiSessionEntity> findSharedAiSessionById(String teamId, String sessionId) {
        return stateForCurrent().sharedAiSessions.stream()
                .filter(session -> teamId.equals(session.getTeamId()) && sessionId.equals(session.getId()))
                .findFirst();
    }

    @Override
    public synchronized TeamSharedQueryEntity saveSharedQuery(TeamSharedQueryEntity query) {
        TenantTeamState state = stateForCurrent();
        state.sharedQueries.removeIf(existing -> existing.getId().equals(query.getId()));
        state.sharedQueries.add(query);
        while (state.sharedQueries.size() > 500) {
            state.sharedQueries.remove(0);
        }
        state.persist();
        return query;
    }

    @Override
    public synchronized void deleteSharedQuery(String teamId, String queryId) {
        TenantTeamState state = stateForCurrent();
        state.sharedQueries.removeIf(query -> teamId.equals(query.getTeamId()) && queryId.equals(query.getId()));
        state.persist();
    }

    @Override
    public List<TeamSharedQueryEntity> findSharedQueriesByTeamId(String teamId) {
        return stateForCurrent().sharedQueries.stream()
                .filter(query -> teamId.equals(query.getTeamId()))
                .sorted(Comparator.comparing(TeamSharedQueryEntity::getUpdatedAt,
                        Comparator.nullsLast(Comparator.naturalOrder())).reversed())
                .toList();
    }

    @Override
    public Optional<TeamSharedQueryEntity> findSharedQueryById(String teamId, String queryId) {
        return stateForCurrent().sharedQueries.stream()
                .filter(query -> teamId.equals(query.getTeamId()) && queryId.equals(query.getId()))
                .findFirst();
    }

    @Override
    public synchronized TeamProductionApprovalEntity saveProductionApproval(TeamProductionApprovalEntity approval) {
        TenantTeamState state = stateForCurrent();
        state.productionApprovals.removeIf(existing -> existing.getId().equals(approval.getId()));
        state.productionApprovals.add(approval);
        while (state.productionApprovals.size() > 500) {
            state.productionApprovals.remove(0);
        }
        state.persist();
        return approval;
    }

    @Override
    public List<TeamProductionApprovalEntity> findProductionApprovalsByTeamId(String teamId, String status) {
        return stateForCurrent().productionApprovals.stream()
                .filter(item -> teamId.equals(item.getTeamId()))
                .filter(item -> status == null || status.isBlank() || status.equalsIgnoreCase(item.getStatus()))
                .sorted(Comparator.comparing(
                        TeamProductionApprovalEntity::getRequestedAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
    }

    @Override
    public Optional<TeamProductionApprovalEntity> findProductionApprovalById(String teamId, String approvalId) {
        return stateForCurrent().productionApprovals.stream()
                .filter(item -> teamId.equals(item.getTeamId()) && approvalId.equals(item.getId()))
                .findFirst();
    }

    @Override
    public synchronized Optional<TeamProductionApprovalEntity> claimProductionApprovalExecution(
            String teamId,
            String approvalId,
            Long reviewerUserId) {
        Optional<TeamProductionApprovalEntity> found = findProductionApprovalById(teamId, approvalId);
        if (found.isEmpty()) {
            return Optional.empty();
        }
        TeamProductionApprovalEntity entity = found.get();
        if (!"pending".equals(entity.getStatus())) {
            return Optional.empty();
        }
        if (reviewerUserId != null && reviewerUserId.equals(entity.getRequestedByUserId())) {
            return Optional.empty();
        }
        entity.setStatus("executing");
        entity.setReviewedByUserId(reviewerUserId);
        entity.setReviewedAt(Instant.now());
        saveProductionApproval(entity);
        return Optional.of(entity);
    }

    /** Used by file→jdbc import. */
    public synchronized void replaceSnapshot(String tenantId, TeamSnapshot snapshot) {
        TenantTeamState state = stateFor(tenantId);
        state.apply(snapshot != null ? snapshot : TeamSnapshot.empty());
        state.persist();
    }

    private final class TenantTeamState {

        private final String tenantId;
        private final List<TeamEntity> teams = new CopyOnWriteArrayList<>();
        private final List<TeamMemberEntity> members = new CopyOnWriteArrayList<>();
        private final List<TeamInviteEntity> invites = new CopyOnWriteArrayList<>();
        private final List<TeamAuditLogEntity> auditLogs = new CopyOnWriteArrayList<>();
        private final List<TeamSharedAiSessionEntity> sharedAiSessions = new CopyOnWriteArrayList<>();
        private final List<TeamSharedQueryEntity> sharedQueries = new CopyOnWriteArrayList<>();
        private final List<TeamProductionApprovalEntity> productionApprovals = new CopyOnWriteArrayList<>();

        private TenantTeamState(String tenantId) {
            this.tenantId = tenantId;
        }

        private void reload() {
            List<String> payloads = jdbc.query(
                    "SELECT payload FROM dw_team_snapshots WHERE tenant_id = ?",
                    (rs, rowNum) -> rs.getString("payload"),
                    tenantId);
            if (payloads.isEmpty()) {
                apply(TeamSnapshot.empty());
                return;
            }
            try {
                TeamSnapshot snapshot = objectMapper.readValue(payloads.get(0), TeamSnapshot.class);
                apply(snapshot != null ? snapshot : TeamSnapshot.empty());
            } catch (Exception ex) {
                throw new IllegalStateException("Failed to read team snapshot for tenant " + tenantId, ex);
            }
        }

        private void apply(TeamSnapshot snapshot) {
            teams.clear();
            teams.addAll(snapshot.teams() != null ? snapshot.teams() : List.of());
            members.clear();
            members.addAll(snapshot.members() != null ? snapshot.members() : List.of());
            invites.clear();
            invites.addAll(snapshot.invites() != null ? snapshot.invites() : List.of());
            auditLogs.clear();
            auditLogs.addAll(snapshot.auditLogs() != null ? snapshot.auditLogs() : List.of());
            sharedAiSessions.clear();
            sharedAiSessions.addAll(snapshot.sharedAiSessions() != null ? snapshot.sharedAiSessions() : List.of());
            sharedQueries.clear();
            sharedQueries.addAll(snapshot.sharedQueries() != null ? snapshot.sharedQueries() : List.of());
            productionApprovals.clear();
            productionApprovals.addAll(snapshot.productionApprovals() != null ? snapshot.productionApprovals() : List.of());
        }

        private void persist() {
            TeamSnapshot snapshot = new TeamSnapshot(
                    new ArrayList<>(teams),
                    new ArrayList<>(members),
                    new ArrayList<>(invites),
                    new ArrayList<>(auditLogs),
                    new ArrayList<>(sharedAiSessions),
                    new ArrayList<>(sharedQueries),
                    new ArrayList<>(productionApprovals));
            String json;
            try {
                json = objectMapper.writeValueAsString(snapshot);
            } catch (Exception ex) {
                throw new IllegalStateException("Failed to serialize team snapshot for tenant " + tenantId, ex);
            }
            Timestamp now = Timestamp.from(Instant.now());
            int updated = jdbc.update(
                    "UPDATE dw_team_snapshots SET payload = ?, updated_at = ? WHERE tenant_id = ?",
                    json,
                    now,
                    tenantId);
            if (updated == 0) {
                jdbc.update(
                        "INSERT INTO dw_team_snapshots (tenant_id, payload, updated_at) VALUES (?,?,?)",
                        tenantId,
                        json,
                        now);
            }
        }
    }
}
