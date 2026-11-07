package org.apache.datawise.backend.service.project;

import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.ProjectStore;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.domain.ActiveProjectDto;
import org.apache.datawise.backend.domain.CreateProjectRequest;
import org.apache.datawise.backend.domain.MoveProjectConnectionsRequest;
import org.apache.datawise.backend.domain.ProjectConnectionMembership;
import org.apache.datawise.backend.domain.ProjectDeleteModes;
import org.apache.datawise.backend.domain.ProjectDto;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.domain.ProjectRequestContext;
import org.apache.datawise.backend.domain.ProjectTemplates;
import org.apache.datawise.backend.domain.SetActiveProjectRequest;
import org.apache.datawise.backend.domain.ShareProjectConnectionsRequest;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.domain.UpdateProjectRequest;
import org.apache.datawise.backend.model.ActiveProjectDocument;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.model.ProjectEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Service
public class ProjectService {

    private final ProjectStore projectStore;
    private final ConnectionStore connectionStore;
    private final UserAccessPolicy userAccessPolicy;
    private final ConfigDirectoryService configDirectory;
    private final TeamStore teamStore;

    public ProjectService(
                          ProjectStore projectStore,
                          ConnectionStore connectionStore,
                          UserAccessPolicy userAccessPolicy,
                          ConfigDirectoryService configDirectory,
                          TeamStore teamStore) {
        this.projectStore = projectStore;
        this.connectionStore = connectionStore;
        this.userAccessPolicy = userAccessPolicy;
        this.configDirectory = configDirectory;
        this.teamStore = teamStore;
    }

    public List<ProjectDto> listProjects(boolean includeArchived) {
        String tenantId = currentTenantId();
        ensureMigrated(tenantId);
        String defaultId = projectStore.loadIndex(tenantId).getDefaultProjectId();
        Set<String> allowed = resolveTeamVisibleProjectIds();
        return projectStore.listProjects(tenantId).stream()
                .filter(p -> includeArchived || !p.isArchived())
                .filter(p -> allowed == null || allowed.contains(p.getId()) || p.getId().equals(defaultId))
                .map(p -> toDto(p, defaultId))
                .toList();
    }

    public ProjectDto getProject(String projectId) {
        String tenantId = currentTenantId();
        ensureMigrated(tenantId);
        ProjectEntity entity = requireProject(tenantId, projectId);
        return toDto(entity, projectStore.loadIndex(tenantId).getDefaultProjectId());
    }

    public ProjectDto createProject(CreateProjectRequest request) {
        userAccessPolicy.requireRegisteredUser();
        if (request == null || request.name() == null || request.name().isBlank()) {
            throw new IllegalArgumentException("PROJECT_NAME_REQUIRED");
        }
        String tenantId = currentTenantId();
        ensureMigrated(tenantId);
        Instant now = Instant.now();
        ProjectEntity entity = new ProjectEntity();
        entity.setId(IdGenerator.shortId("proj_"));
        entity.setName(request.name().trim());
        entity.setColorKey(blankToNull(request.colorKey()));
        entity.setDescription(request.description() != null ? request.description().trim() : "");
        entity.setCreatedAt(now);
        entity.setUpdatedAt(now);
        entity.setArchived(false);
        entity.setDocsDir("docs");
        entity.setScriptsDir("scripts");
        String templateId = ProjectConnectionMembership.normalizeTemplateId(request.templateId());
        entity.setTemplateId(templateId);
        entity.setDefaultEnv(ProjectConnectionMembership.normalizeDefaultEnv(request.defaultEnv()));
        projectStore.upsertProject(tenantId, entity);
        seedTemplateFiles(tenantId, entity.getId(), templateId);
        return toDto(entity, projectStore.loadIndex(tenantId).getDefaultProjectId());
    }

    public ProjectDto updateProject(String projectId, UpdateProjectRequest request) {
        userAccessPolicy.requireRegisteredUser();
        String tenantId = currentTenantId();
        ensureMigrated(tenantId);
        ProjectEntity entity = requireProject(tenantId, projectId);
        if (request != null) {
            if (request.name() != null && !request.name().isBlank()) {
                entity.setName(request.name().trim());
            }
            if (request.colorKey() != null) {
                entity.setColorKey(blankToNull(request.colorKey()));
            }
            if (request.description() != null) {
                entity.setDescription(request.description().trim());
            }
            if (request.archived() != null) {
                if (ProjectIds.DEFAULT.equals(entity.getId()) && Boolean.TRUE.equals(request.archived())) {
                    throw new IllegalArgumentException("PROJECT_DEFAULT_IMMUTABLE");
                }
                entity.setArchived(request.archived());
            }
            if (request.docsDir() != null && !request.docsDir().isBlank()) {
                entity.setDocsDir(request.docsDir().trim());
            }
            if (request.scriptsDir() != null && !request.scriptsDir().isBlank()) {
                entity.setScriptsDir(request.scriptsDir().trim());
            }
            if (request.defaultEnv() != null) {
                entity.setDefaultEnv(ProjectConnectionMembership.normalizeDefaultEnv(request.defaultEnv()));
            }
            if (request.templateId() != null && !request.templateId().isBlank()) {
                entity.setTemplateId(ProjectConnectionMembership.normalizeTemplateId(request.templateId()));
            }
        }
        entity.setUpdatedAt(Instant.now());
        projectStore.upsertProject(tenantId, entity);
        return toDto(entity, projectStore.loadIndex(tenantId).getDefaultProjectId());
    }

    public void deleteProject(String projectId) {
        deleteProject(projectId, ProjectDeleteModes.EMPTY_ONLY, false);
    }

    public void deleteProject(String projectId, String mode, boolean confirmPurgeConnections) {
        userAccessPolicy.requireRegisteredUser();
        String tenantId = currentTenantId();
        ensureMigrated(tenantId);
        String id = ProjectIds.normalizeOrDefault(projectId);
        if (ProjectIds.DEFAULT.equals(id)) {
            throw new IllegalArgumentException("PROJECT_DEFAULT_IMMUTABLE");
        }
        requireProject(tenantId, id);
        String normalizedMode = ProjectDeleteModes.normalize(mode);

        List<ConnectionEntity> connections = connectionStore.findAllConnections();
        List<ConnectionGroupEntity> groups = connectionStore.findAllGroups();
        List<ConnectionEntity> ownedConnections = connections.stream()
                .filter(c -> id.equals(ProjectIds.normalizeOrDefault(c.getProjectId())))
                .toList();
        List<ConnectionGroupEntity> ownedGroups = groups.stream()
                .filter(g -> id.equals(ProjectIds.normalizeOrDefault(g.getProjectId())))
                .toList();

        if (ProjectDeleteModes.EMPTY_ONLY.equals(normalizedMode)) {
            if (!ownedConnections.isEmpty()) {
                throw new IllegalArgumentException("PROJECT_NOT_EMPTY");
            }
        } else if (ProjectDeleteModes.MOVE_TO_DEFAULT.equals(normalizedMode)) {
            if (!ownedConnections.isEmpty() || !ownedGroups.isEmpty()) {
                moveOwnedToProject(connections, groups, id, ProjectIds.DEFAULT);
            }
        } else if (ProjectDeleteModes.PURGE.equals(normalizedMode)) {
            if (!ownedConnections.isEmpty() && !confirmPurgeConnections) {
                throw new IllegalArgumentException("PROJECT_PURGE_CONNECTIONS_CONFIRM_REQUIRED");
            }
            if (!ownedConnections.isEmpty() || !ownedGroups.isEmpty()) {
                purgeOwned(connections, groups, id);
            }
            deleteProjectFilesystem(tenantId, id);
        }

        projectStore.deleteProject(tenantId, id);
        ActiveProjectDocument active = projectStore.loadActiveProject(UserContext.requireUserId(), tenantId);
        if (id.equals(ProjectIds.normalizeOrDefault(active.getProjectId()))) {
            projectStore.saveActiveProject(
                    UserContext.requireUserId(),
                    tenantId,
                    new ActiveProjectDocument(ProjectIds.DEFAULT));
        }
    }

    public int moveConnections(String sourceProjectId, MoveProjectConnectionsRequest request) {
        userAccessPolicy.requireRegisteredUser();
        if (request == null || request.connectionIds() == null || request.connectionIds().isEmpty()) {
            throw new IllegalArgumentException("CONNECTION_IDS_REQUIRED");
        }
        if (request.targetProjectId() == null || request.targetProjectId().isBlank()) {
            throw new IllegalArgumentException("TARGET_PROJECT_ID_REQUIRED");
        }
        String tenantId = currentTenantId();
        ensureMigrated(tenantId);
        String sourceId = ProjectIds.normalizeOrDefault(sourceProjectId);
        String targetId = ProjectIds.normalizeOrDefault(request.targetProjectId());
        requireProject(tenantId, sourceId);
        requireProject(tenantId, targetId);
        if (sourceId.equals(targetId)) {
            return 0;
        }

        Set<String> wanted = new HashSet<>();
        for (String connectionId : request.connectionIds()) {
            if (connectionId != null && !connectionId.isBlank()) {
                wanted.add(connectionId.trim());
            }
        }
        if (wanted.isEmpty()) {
            throw new IllegalArgumentException("CONNECTION_IDS_REQUIRED");
        }

        List<ConnectionEntity> connections = connectionStore.findAllConnections();
        List<ConnectionGroupEntity> groups = connectionStore.findAllGroups();
        int moved = 0;
        List<ConnectionEntity> nextConnections = new ArrayList<>(connections.size());
        for (ConnectionEntity connection : connections) {
            if (wanted.contains(connection.getId())
                    && sourceId.equals(ProjectIds.normalizeOrDefault(connection.getProjectId()))) {
                connection.setProjectId(targetId);
                moved++;
            }
            nextConnections.add(connection);
        }
        if (moved == 0) {
            throw new IllegalArgumentException("CONNECTIONS_NOT_FOUND_IN_PROJECT");
        }
        connectionStore.replaceAll(groups, nextConnections);
        return moved;
    }

    /**
     * 将本项目主属连接共享到其他项目（不改主属 {@code projectId}）。
     */
    public int shareConnections(String sourceProjectId, ShareProjectConnectionsRequest request) {
        userAccessPolicy.requireRegisteredUser();
        if (request == null || request.connectionIds() == null || request.connectionIds().isEmpty()) {
            throw new IllegalArgumentException("CONNECTION_IDS_REQUIRED");
        }
        if (request.targetProjectIds() == null || request.targetProjectIds().isEmpty()) {
            throw new IllegalArgumentException("TARGET_PROJECT_IDS_REQUIRED");
        }
        String tenantId = currentTenantId();
        ensureMigrated(tenantId);
        String sourceId = ProjectIds.normalizeOrDefault(sourceProjectId);
        requireProject(tenantId, sourceId);

        Set<String> targets = new LinkedHashSet<>();
        for (String target : request.targetProjectIds()) {
            if (target == null || target.isBlank()) {
                continue;
            }
            String tid = ProjectIds.normalizeOrDefault(target);
            if (tid.equals(sourceId)) {
                continue;
            }
            requireProject(tenantId, tid);
            targets.add(tid);
        }
        if (targets.isEmpty()) {
            throw new IllegalArgumentException("TARGET_PROJECT_IDS_REQUIRED");
        }

        Set<String> wanted = new HashSet<>();
        for (String connectionId : request.connectionIds()) {
            if (connectionId != null && !connectionId.isBlank()) {
                wanted.add(connectionId.trim());
            }
        }
        if (wanted.isEmpty()) {
            throw new IllegalArgumentException("CONNECTION_IDS_REQUIRED");
        }

        List<ConnectionEntity> connections = connectionStore.findAllConnections();
        List<ConnectionGroupEntity> groups = connectionStore.findAllGroups();
        int updated = 0;
        List<ConnectionEntity> nextConnections = new ArrayList<>(connections.size());
        for (ConnectionEntity connection : connections) {
            if (wanted.contains(connection.getId())
                    && sourceId.equals(ProjectIds.normalizeOrDefault(connection.getProjectId()))) {
                Set<String> shared = new LinkedHashSet<>(
                        ProjectConnectionMembership.normalizeSharedIds(connection.getSharedProjectIds()));
                shared.addAll(targets);
                shared.remove(sourceId);
                connection.setSharedProjectIds(new ArrayList<>(shared));
                updated++;
            }
            nextConnections.add(connection);
        }
        if (updated == 0) {
            throw new IllegalArgumentException("CONNECTIONS_NOT_FOUND_IN_PROJECT");
        }
        connectionStore.replaceAll(groups, nextConnections);
        return updated;
    }

    private void moveOwnedToProject(
                                    List<ConnectionEntity> connections,
                                    List<ConnectionGroupEntity> groups,
                                    String fromProjectId,
                                    String toProjectId) {
        List<ConnectionGroupEntity> nextGroups = new ArrayList<>(groups.size());
        for (ConnectionGroupEntity group : groups) {
            if (fromProjectId.equals(ProjectIds.normalizeOrDefault(group.getProjectId()))) {
                group.setProjectId(toProjectId);
            }
            nextGroups.add(group);
        }
        List<ConnectionEntity> nextConnections = new ArrayList<>(connections.size());
        for (ConnectionEntity connection : connections) {
            if (fromProjectId.equals(ProjectIds.normalizeOrDefault(connection.getProjectId()))) {
                connection.setProjectId(toProjectId);
            }
            nextConnections.add(connection);
        }
        connectionStore.replaceAll(nextGroups, nextConnections);
    }

    private void purgeOwned(
                            List<ConnectionEntity> connections,
                            List<ConnectionGroupEntity> groups,
                            String projectId) {
        List<ConnectionGroupEntity> nextGroups = groups.stream()
                .filter(g -> !projectId.equals(ProjectIds.normalizeOrDefault(g.getProjectId())))
                .toList();
        List<ConnectionEntity> nextConnections = connections.stream()
                .filter(c -> !projectId.equals(ProjectIds.normalizeOrDefault(c.getProjectId())))
                .toList();
        connectionStore.replaceAll(new ArrayList<>(nextGroups), new ArrayList<>(nextConnections));
    }

    private void deleteProjectFilesystem(String tenantId, String projectId) {
        Path root = configDirectory.resolve(ConfigPaths.tenantProjectDir(tenantId, projectId));
        if (!Files.exists(root)) {
            return;
        }
        try {
            Files.walkFileTree(root, new SimpleFileVisitor<>() {

                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    Files.deleteIfExists(file);
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult postVisitDirectory(Path dir, IOException exc) throws IOException {
                    Files.deleteIfExists(dir);
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to purge project directory for " + projectId, ex);
        }
    }

    public ActiveProjectDto getActiveProject() {
        String tenantId = currentTenantId();
        ensureMigrated(tenantId);
        String activeId = resolveActiveProjectId();
        ProjectEntity entity = requireProject(tenantId, activeId);
        return new ActiveProjectDto(activeId, toDto(entity, projectStore.loadIndex(tenantId).getDefaultProjectId()));
    }

    public ActiveProjectDto setActiveProject(SetActiveProjectRequest request) {
        userAccessPolicy.requireRegisteredUser();
        if (request == null || request.projectId() == null || request.projectId().isBlank()) {
            throw new IllegalArgumentException("PROJECT_ID_REQUIRED");
        }
        String tenantId = currentTenantId();
        ensureMigrated(tenantId);
        String id = request.projectId().trim();
        ProjectEntity entity = requireProject(tenantId, id);
        if (entity.isArchived()) {
            throw new IllegalArgumentException("PROJECT_ARCHIVED");
        }
        projectStore.saveActiveProject(
                UserContext.requireUserId(),
                tenantId,
                new ActiveProjectDocument(id));
        return new ActiveProjectDto(id, toDto(entity, projectStore.loadIndex(tenantId).getDefaultProjectId()));
    }

    /**
     * 解析当前请求活动项目：Header → 用户 active → default。
     */
    public String resolveActiveProjectId() {
        String tenantId = currentTenantId();
        ensureMigrated(tenantId);
        String fromHeader = ProjectRequestContext.projectIdOverride();
        if (fromHeader != null) {
            if (projectStore.findProject(tenantId, fromHeader).isPresent()) {
                return fromHeader;
            }
        }
        if (!UserContext.isGuest() && UserContext.getUserId() != null) {
            ActiveProjectDocument doc = projectStore.loadActiveProject(UserContext.getUserId(), tenantId);
            String active = ProjectIds.normalizeOrDefault(doc != null ? doc.getProjectId() : null);
            if (projectStore.findProject(tenantId, active).isPresent()) {
                return active;
            }
        }
        String defaultId = projectStore.ensureDefaultProject(tenantId);
        if (!UserContext.isGuest() && UserContext.getUserId() != null) {
            projectStore.saveActiveProject(
                    UserContext.getUserId(),
                    tenantId,
                    new ActiveProjectDocument(defaultId));
        }
        return defaultId;
    }

    public void ensureMigrated(String tenantId) {
        String tid = TenantIds.normalizeOrDefault(tenantId);
        projectStore.ensureDefaultProject(tid);
        stampMissingProjectIds(tid);
    }

    private void stampMissingProjectIds(String tenantId) {
        String defaultId = ProjectIds.DEFAULT;
        List<ConnectionGroupEntity> groups = connectionStore.findAllGroups();
        List<ConnectionEntity> connections = connectionStore.findAllConnections();
        boolean dirty = false;
        List<ConnectionGroupEntity> nextGroups = new ArrayList<>(groups.size());
        for (ConnectionGroupEntity group : groups) {
            if (group.getProjectId() == null || group.getProjectId().isBlank()) {
                group.setProjectId(defaultId);
                dirty = true;
            }
            nextGroups.add(group);
        }
        List<ConnectionEntity> nextConnections = new ArrayList<>(connections.size());
        for (ConnectionEntity connection : connections) {
            if (connection.getProjectId() == null || connection.getProjectId().isBlank()) {
                connection.setProjectId(defaultId);
                dirty = true;
            }
            nextConnections.add(connection);
        }
        if (dirty) {
            connectionStore.replaceAll(nextGroups, nextConnections);
        }
    }

    private ProjectEntity requireProject(String tenantId, String projectId) {
        String id = ProjectIds.normalizeOrDefault(projectId);
        return projectStore.findProject(tenantId, id)
                .orElseThrow(() -> new IllegalArgumentException("PROJECT_NOT_FOUND"));
    }

    private String currentTenantId() {
        return TenantIds.normalizeOrDefault(UserContext.getTenantId());
    }

    private static ProjectDto toDto(ProjectEntity entity, String defaultProjectId) {
        Objects.requireNonNull(entity, "project");
        return new ProjectDto(
                entity.getId(),
                entity.getName(),
                entity.getColorKey(),
                entity.getDescription(),
                entity.getCreatedAt(),
                entity.getUpdatedAt(),
                entity.isArchived(),
                entity.getDocsDir(),
                entity.getScriptsDir(),
                entity.getId() != null && entity.getId().equals(defaultProjectId),
                entity.getDefaultEnv(),
                entity.getTemplateId());
    }

    /**
     * @return {@code null} 表示不限制；非 null 为允许的项目 ID 并集。
     */
    private Set<String> resolveTeamVisibleProjectIds() {
        if (UserContext.isGuest() || UserContext.getUserId() == null) {
            return null;
        }
        long userId = UserContext.getUserId();
        String tenantId = currentTenantId();
        boolean sawRestrictingTeam = false;
        Set<String> allowed = new HashSet<>();
        for (TeamMemberEntity membership : teamStore.findMembersByUserId(userId)) {
            TeamEntity team = teamStore.findTeamById(membership.getTeamId()).orElse(null);
            if (team == null) {
                continue;
            }
            String teamTenant = team.getTenantId() == null || team.getTenantId().isBlank()
                    ? TenantIds.DEFAULT
                    : team.getTenantId().trim();
            if (!tenantId.equals(TenantIds.normalizeOrDefault(teamTenant))) {
                continue;
            }
            List<String> visible = team.getVisibleProjectIds();
            if (visible == null || visible.isEmpty()) {
                return null;
            }
            sawRestrictingTeam = true;
            for (String id : visible) {
                if (id != null && !id.isBlank()) {
                    allowed.add(id.trim());
                }
            }
        }
        return sawRestrictingTeam ? allowed : null;
    }

    private void seedTemplateFiles(String tenantId, String projectId, String templateId) {
        Path root = configDirectory.resolve(ConfigPaths.tenantProjectDir(tenantId, projectId));
        try {
            Path docs = root.resolve("docs");
            Path scripts = root.resolve("scripts");
            Files.createDirectories(docs);
            Files.createDirectories(scripts);
            String readme = switch (templateId) {
                case ProjectTemplates.ECOMMERCE -> """
                        # 电商项目

                        建议目录：订单 / 库存 / 会员。在本项目下添加对应数据库与中间件连接。
                        """;
                case ProjectTemplates.DATA_PLATFORM -> """
                        # 数据中台项目

                        建议目录：ODS / DWD / ADS。可在 scripts 放置调度 SQL 与同步脚本。
                        """;
                default -> """
                        # 项目文档

                        在此放置本项目的说明与设计笔记。
                        """;
            };
            Path readmePath = docs.resolve("README.md");
            if (!Files.exists(readmePath)) {
                Files.writeString(readmePath, readme, StandardCharsets.UTF_8);
            }
            if (ProjectTemplates.DATA_PLATFORM.equals(templateId)) {
                Path sample = scripts.resolve("ods_example.sql");
                if (!Files.exists(sample)) {
                    Files.writeString(sample, "-- ODS example placeholder\nSELECT 1;\n", StandardCharsets.UTF_8);
                }
            }
            if (ProjectTemplates.ECOMMERCE.equals(templateId)) {
                Path sample = scripts.resolve("orders_healthcheck.sql");
                if (!Files.exists(sample)) {
                    Files.writeString(sample, "-- Orders healthcheck placeholder\nSELECT 1;\n", StandardCharsets.UTF_8);
                }
            }
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to seed project template files for " + projectId, ex);
        }
    }

    private static String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
