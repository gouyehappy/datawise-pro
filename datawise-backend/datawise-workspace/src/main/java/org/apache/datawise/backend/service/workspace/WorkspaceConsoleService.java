package org.apache.datawise.backend.service.workspace;

import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.configstore.WorkspaceStore;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.domain.ProjectRequestContext;
import org.apache.datawise.backend.domain.SaveConsoleRequest;
import org.apache.datawise.backend.domain.SavedConsoleDto;
import org.apache.datawise.backend.model.SavedConsoleEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.service.UserAccountService;
import org.apache.datawise.backend.service.UserResource;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.apache.datawise.backend.service.project.ProjectService;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class WorkspaceConsoleService {

    private static final DateTimeFormatter UPDATED_FMT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneId.systemDefault());

    private final WorkspaceStore workspaceStore;
    private final ConnectionStore connectionStore;
    private final TeamStore teamStore;
    private final UserAccountService userAccountService;
    private final UserResourcePolicy resourcePolicy;
    private final ProjectService projectService;

    public WorkspaceConsoleService(
            WorkspaceStore workspaceStore,
            ConnectionStore connectionStore,
            TeamStore teamStore,
            UserAccountService userAccountService,
            UserResourcePolicy resourcePolicy,
            ProjectService projectService
    ) {
        this.workspaceStore = workspaceStore;
        this.connectionStore = connectionStore;
        this.teamStore = teamStore;
        this.userAccountService = userAccountService;
        this.resourcePolicy = resourcePolicy;
        this.projectService = projectService;
    }

    public List<SavedConsoleDto> listSavedConsoles() {
        Long userId = userAccountService.requireUserId();
        String activeProjectId = resolveActiveProjectId();
        boolean scopeAll = ProjectRequestContext.isScopeAll();
        Map<String, SavedConsoleEntity> merged = new LinkedHashMap<>();
        for (SavedConsoleEntity entity : workspaceStore.findSavedConsolesByUserId(userId)) {
            if (!scopeAll && !matchesProject(entity.getProjectId(), activeProjectId)) {
                continue;
            }
            merged.put(entity.getId(), entity);
        }

        Set<String> sharedConsoleIds = new HashSet<>();
        for (TeamMemberEntity membership : teamStore.findMembersByUserId(userId)) {
            TeamEntity team = teamStore.findTeamById(membership.getTeamId()).orElse(null);
            if (team != null) {
                sharedConsoleIds.addAll(team.getSharedConsoleIds());
            }
        }
        for (SavedConsoleEntity entity : workspaceStore.findSavedConsolesByIds(new ArrayList<>(sharedConsoleIds))) {
            if (!scopeAll && !matchesProject(entity.getProjectId(), activeProjectId)) {
                continue;
            }
            merged.putIfAbsent(entity.getId(), entity);
        }

        return merged.values().stream()
                .sorted(Comparator.comparing(SavedConsoleEntity::getUpdatedAt).reversed())
                .map(entity -> toSavedConsoleDto(entity, !userId.equals(entity.getUserId())))
                .toList();
    }

    public SavedConsoleDto saveConsole(SaveConsoleRequest request) {
        resourcePolicy.requireWrite(UserResource.WORKSPACE_USER_DATA);
        Long userId = userAccountService.requireUserId();
        if (request.name() == null || request.name().isBlank()) {
            throw new IllegalArgumentException("Console name is required");
        }
        SavedConsoleEntity entity = workspaceStore.findSavedConsoleByUserIdAndName(userId, request.name())
                .orElseGet(() -> {
                    SavedConsoleEntity created = new SavedConsoleEntity();
                    created.setId(IdGenerator.shortId("c-"));
                    created.setUserId(userId);
                    created.setName(request.name());
                    return created;
                });
        entity.setSqlContent(request.sql());
        if (request.folder() != null && !request.folder().isBlank()) {
            entity.setFolder(request.folder().trim());
        }
        if (request.tags() != null && !request.tags().isEmpty()) {
            entity.setTags(request.tags());
        }
        if (request.connectionName() != null && !request.connectionName().isBlank()) {
            connectionStore.findAllConnections().stream()
                    .filter(conn -> conn.getName().equals(request.connectionName()))
                    .findFirst()
                    .ifPresent(conn -> entity.setConnectionId(conn.getId()));
        }
        entity.setProjectId(resolveActiveProjectId());
        entity.setUpdatedAt(Instant.now());
        workspaceStore.saveSavedConsole(entity);
        SavedConsoleDto dto = toSavedConsoleDto(entity, false);
        String connectionName = request.connectionName() != null && !request.connectionName().isBlank()
                ? request.connectionName()
                : dto.connectionName();
        return new SavedConsoleDto(
                dto.id(),
                dto.name(),
                connectionName,
                dto.updatedAt(),
                dto.sql(),
                false,
                dto.folder(),
                dto.tags(),
                dto.projectId()
        );
    }

    private String resolveActiveProjectId() {
        String fromHeader = ProjectRequestContext.projectIdOverride();
        if (fromHeader != null && !fromHeader.isBlank()) {
            return ProjectIds.normalizeOrDefault(fromHeader);
        }
        return ProjectIds.normalizeOrDefault(projectService.resolveActiveProjectId());
    }

    private static boolean matchesProject(String entityProjectId, String activeProjectId) {
        String normalized = entityProjectId == null || entityProjectId.isBlank()
                ? ProjectIds.DEFAULT
                : entityProjectId.trim();
        return activeProjectId.equals(normalized);
    }

    private SavedConsoleDto toSavedConsoleDto(SavedConsoleEntity entity, boolean teamShared) {
        String connectionName = "\u2014";
        if (entity.getConnectionId() != null) {
            connectionName = connectionStore.findConnectionById(entity.getConnectionId())
                    .map(conn -> conn.getName())
                    .orElse("\u2014");
        }
        return new SavedConsoleDto(
                entity.getId(),
                entity.getName(),
                connectionName,
                UPDATED_FMT.format(entity.getUpdatedAt()),
                entity.getSqlContent(),
                teamShared,
                entity.getFolder(),
                entity.getTags() != null ? entity.getTags() : List.of(),
                entity.getProjectId()
        );
    }
}
