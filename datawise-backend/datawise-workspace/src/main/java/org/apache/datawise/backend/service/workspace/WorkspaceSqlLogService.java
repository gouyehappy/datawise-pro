package org.apache.datawise.backend.service.workspace;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.configstore.SqlHistoryLimits;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.configstore.WorkspaceStore;
import org.apache.datawise.backend.domain.AppendSqlLogRequest;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.domain.ProjectRequestContext;
import org.apache.datawise.backend.domain.SqlExecutionStatsDto;
import org.apache.datawise.backend.domain.SqlLogDto;
import org.apache.datawise.backend.domain.SlowSqlEntryDto;
import org.apache.datawise.backend.domain.SqlStatsTrendPointDto;
import org.apache.datawise.backend.model.SqlHistoryEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.service.UserAccountService;
import org.apache.datawise.backend.service.UserResource;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.apache.datawise.backend.service.project.ProjectService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class WorkspaceSqlLogService {

    private static final DateTimeFormatter TIME_FMT =
            DateTimeFormatter.ofPattern("HH:mm:ss").withZone(ZoneId.systemDefault());

    private static final Logger log = LoggerFactory.getLogger(WorkspaceSqlLogService.class);

    private final WorkspaceStore workspaceStore;
    private final TeamStore teamStore;
    private final UserAccountService userAccountService;
    private final UserResourcePolicy resourcePolicy;
    private final ProjectService projectService;

    public WorkspaceSqlLogService(
            WorkspaceStore workspaceStore,
            TeamStore teamStore,
            UserAccountService userAccountService,
            UserResourcePolicy resourcePolicy,
            ProjectService projectService
    ) {
        this.workspaceStore = workspaceStore;
        this.teamStore = teamStore;
        this.userAccountService = userAccountService;
        this.resourcePolicy = resourcePolicy;
        this.projectService = projectService;
    }

    public List<SqlLogDto> listSqlLogs() {
        Long userId = userAccountService.requireUserId();
        return collectMergedSqlHistory(userId).stream()
                .map(entity -> toSqlLogDto(entity, !userId.equals(entity.getUserId())))
                .toList();
    }

    public SqlExecutionStatsDto getSqlExecutionStats(
            String connectionId,
            int days,
            int limit,
            long slowThresholdMs
    ) {
        Long userId = userAccountService.requireUserId();
        int safeDays = Math.max(1, Math.min(days, 90));
        int safeLimit = Math.max(1, Math.min(limit, 50));
        long threshold = Math.max(0, slowThresholdMs);
        Instant since = Instant.now().minus(safeDays, ChronoUnit.DAYS);

        List<SqlHistoryEntity> history = collectMergedSqlHistory(userId).stream()
                .filter(entity -> entity.getExecutedAt() != null && entity.getExecutedAt().isAfter(since))
                .filter(entity -> connectionId == null
                        || connectionId.isBlank()
                        || connectionId.equals(entity.getConnectionId()))
                .toList();

        long totalRuns = history.size();
        long durationSum = history.stream()
                .filter(entity -> entity.getDurationMs() != null)
                .mapToLong(SqlHistoryEntity::getDurationMs)
                .sum();
        long durationCount = history.stream()
                .filter(entity -> entity.getDurationMs() != null)
                .count();
        long avgDurationMs = durationCount == 0 ? 0 : durationSum / durationCount;

        List<SlowSqlEntryDto> slowQueries = history.stream()
                .filter(entity -> "success".equalsIgnoreCase(entity.getStatus()))
                .filter(entity -> entity.getDurationMs() != null && entity.getDurationMs() >= threshold)
                .sorted(Comparator.comparing(SqlHistoryEntity::getDurationMs).reversed())
                .limit(safeLimit)
                .map(entity -> toSlowSqlEntry(entity, !userId.equals(entity.getUserId())))
                .toList();

        Map<LocalDate, List<Long>> durationsByDate = new LinkedHashMap<>();
        Map<LocalDate, Long> countsByDate = new LinkedHashMap<>();
        ZoneId zone = ZoneId.systemDefault();
        for (SqlHistoryEntity entity : history) {
            if (entity.getExecutedAt() == null) {
                continue;
            }
            LocalDate date = entity.getExecutedAt().atZone(zone).toLocalDate();
            countsByDate.merge(date, 1L, Long::sum);
            if (entity.getDurationMs() != null) {
                durationsByDate.computeIfAbsent(date, ignored -> new ArrayList<>()).add(entity.getDurationMs());
            }
        }

        List<SqlStatsTrendPointDto> trend = countsByDate.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> {
                    LocalDate date = entry.getKey();
                    List<Long> durations = durationsByDate.getOrDefault(date, List.of());
                    long max = durations.stream().mapToLong(Long::longValue).max().orElse(0);
                    long avg = durations.isEmpty()
                            ? 0
                            : durations.stream().mapToLong(Long::longValue).sum() / durations.size();
                    return new SqlStatsTrendPointDto(
                            date.toString(),
                            entry.getValue(),
                            avg,
                            max
                    );
                })
                .toList();

        return new SqlExecutionStatsDto(
                slowQueries,
                trend,
                totalRuns,
                avgDurationMs,
                threshold,
                safeDays
        );
    }

    public SqlLogDto appendSqlLog(AppendSqlLogRequest request) {
        resourcePolicy.requireWrite(UserResource.WORKSPACE_USER_DATA);
        Long userId = userAccountService.requireUserId();
        SqlHistoryEntity entity = new SqlHistoryEntity();
        entity.setId(IdGenerator.shortId("l-"));
        entity.setUserId(userId);
        entity.setConnectionId(request.connectionId());
        entity.setDatabase(request.database());
        entity.setSqlText(request.sql() != null ? request.sql() : "");
        entity.setStatus(request.status() != null ? request.status() : "success");
        entity.setRowCount(request.rows());
        if (request.durationMs() != null && request.durationMs() >= 0) {
            entity.setDurationMs(request.durationMs());
        } else if (request.duration() != null && request.duration().endsWith("ms")) {
            try {
                entity.setDurationMs(Long.parseLong(request.duration().replace("ms", "").trim()));
            } catch (NumberFormatException ex) {
                ExceptionLogging.recoverable(log, "Invalid SQL log duration format", ex);
                entity.setDurationMs(null);
            }
        }
        entity.setExecutedAt(Instant.now());
        String projectId = ProjectRequestContext.projectIdOverride();
        if (projectId == null || projectId.isBlank()) {
            projectId = projectService.resolveActiveProjectId();
        }
        entity.setProjectId(ProjectIds.normalizeOrDefault(projectId));
        workspaceStore.saveSqlHistory(entity);
        return toSqlLogDto(entity, false);
    }

    private List<SqlHistoryEntity> collectMergedSqlHistory(Long userId) {
        Map<String, SqlHistoryEntity> merged = new LinkedHashMap<>();
        String activeProjectId = ProjectIds.normalizeOrDefault(
                ProjectRequestContext.projectIdOverride() != null
                        ? ProjectRequestContext.projectIdOverride()
                        : projectService.resolveActiveProjectId()
        );
        boolean scopeAll = ProjectRequestContext.isScopeAll();
        for (SqlHistoryEntity entity : workspaceStore.findSqlHistoryByUserId(userId)) {
            if (!scopeAll && !matchesProject(entity.getProjectId(), activeProjectId)) {
                continue;
            }
            merged.put(entity.getId(), entity);
        }

        for (TeamMemberEntity membership : teamStore.findMembersByUserId(userId)) {
            TeamEntity team = teamStore.findTeamById(membership.getTeamId()).orElse(null);
            if (team == null || !team.isShareSqlHistory()) {
                continue;
            }
            Set<String> sharedConnections = new HashSet<>(team.getSharedConnectionIds());
            if (sharedConnections.isEmpty()) {
                continue;
            }
            List<Long> peerUserIds = teamStore.findMembersByTeamId(team.getId()).stream()
                    .map(TeamMemberEntity::getUserId)
                    .filter(id -> !userId.equals(id))
                    .toList();
            for (SqlHistoryEntity entity : workspaceStore.findSqlHistoryByUserIds(peerUserIds)) {
                if (entity.getConnectionId() == null || !sharedConnections.contains(entity.getConnectionId())) {
                    continue;
                }
                if (!scopeAll && !matchesProject(entity.getProjectId(), activeProjectId)) {
                    continue;
                }
                merged.putIfAbsent(entity.getId(), entity);
            }
        }

        return merged.values().stream()
                .sorted(Comparator.comparing(SqlHistoryEntity::getExecutedAt).reversed())
                .limit(SqlHistoryLimits.FREE_MAX_ENTRIES)
                .toList();
    }

    private static boolean matchesProject(String entityProjectId, String activeProjectId) {
        // 旧数据无 projectId → 视为默认项目，避免升级后历史全部消失
        String normalized = entityProjectId == null || entityProjectId.isBlank()
                ? ProjectIds.DEFAULT
                : entityProjectId.trim();
        return activeProjectId.equals(normalized);
    }

    private SqlLogDto toSqlLogDto(SqlHistoryEntity entity, boolean teamShared) {
        Long durationMs = entity.getDurationMs();
        String duration = durationMs != null ? durationMs + "ms" : "\u2014";
        return new SqlLogDto(
                entity.getId(),
                entity.getSqlText(),
                TIME_FMT.format(entity.getExecutedAt()),
                duration,
                durationMs,
                entity.getStatus(),
                entity.getRowCount(),
                teamShared,
                entity.getConnectionId(),
                entity.getDatabase(),
                entity.getProjectId()
        );
    }

    private SlowSqlEntryDto toSlowSqlEntry(SqlHistoryEntity entity, boolean teamShared) {
        return new SlowSqlEntryDto(
                entity.getId(),
                entity.getSqlText(),
                entity.getConnectionId(),
                entity.getDurationMs() != null ? entity.getDurationMs() : 0,
                entity.getRowCount(),
                entity.getExecutedAt() != null ? entity.getExecutedAt().toString() : "",
                teamShared
        );
    }
}
