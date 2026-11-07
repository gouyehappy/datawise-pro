package org.apache.datawise.backend.configstore.jdbc;

import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.ProjectStore;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.ActiveProjectDocument;
import org.apache.datawise.backend.model.ProjectEntity;
import org.apache.datawise.backend.model.ProjectIndexDocument;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * JDBC 元数据后端的项目索引与活动项目；docs/scripts 目录仍落在 config 文件系统。
 */
@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "jdbc")
public class JdbcProjectStore implements ProjectStore {

    private final JdbcTemplate jdbc;
    private final ConfigDirectoryService configDirectory;

    public JdbcProjectStore(
                            @Qualifier(MetadataJdbcConfiguration.METADATA_JDBC) JdbcTemplate jdbc,
                            ConfigDirectoryService configDirectory) {
        this.jdbc = jdbc;
        this.configDirectory = configDirectory;
    }

    private RowMapper<ProjectEntity> projectMapper() {
        return (rs, rowNum) -> {
            ProjectEntity entity = new ProjectEntity();
            entity.setId(rs.getString("id"));
            entity.setName(rs.getString("name"));
            entity.setColorKey(rs.getString("color_key"));
            entity.setDescription(rs.getString("description"));
            Timestamp created = rs.getTimestamp("created_at");
            Timestamp updated = rs.getTimestamp("updated_at");
            if (created != null) {
                entity.setCreatedAt(created.toInstant());
            }
            if (updated != null) {
                entity.setUpdatedAt(updated.toInstant());
            }
            entity.setArchived(rs.getBoolean("archived"));
            String docsDir = rs.getString("docs_dir");
            String scriptsDir = rs.getString("scripts_dir");
            entity.setDocsDir(docsDir != null && !docsDir.isBlank() ? docsDir : "docs");
            entity.setScriptsDir(scriptsDir != null && !scriptsDir.isBlank() ? scriptsDir : "scripts");
            entity.setDefaultEnv(rs.getString("default_env"));
            entity.setTemplateId(rs.getString("template_id"));
            return entity;
        };
    }

    @Override
    public ProjectIndexDocument loadIndex(String tenantId) {
        String tid = TenantIds.normalizeOrDefault(tenantId);
        ProjectIndexDocument index = emptyIndex();
        List<ProjectIndexDocument> meta = jdbc.query(
                "SELECT version, default_project_id FROM dw_project_index WHERE tenant_id = ?",
                (rs, rowNum) -> {
                    ProjectIndexDocument doc = emptyIndex();
                    doc.setVersion(rs.getInt("version"));
                    String defaultId = rs.getString("default_project_id");
                    doc.setDefaultProjectId(
                            defaultId != null && !defaultId.isBlank() ? defaultId : ProjectIds.DEFAULT);
                    return doc;
                },
                tid);
        if (!meta.isEmpty()) {
            index.setVersion(meta.get(0).getVersion() > 0 ? meta.get(0).getVersion() : 1);
            index.setDefaultProjectId(meta.get(0).getDefaultProjectId());
        }
        index.setProjects(listProjects(tid));
        return index;
    }

    @Override
    public synchronized void saveIndex(String tenantId, ProjectIndexDocument index) {
        String tid = TenantIds.normalizeOrDefault(tenantId);
        ProjectIndexDocument copy = index != null ? index : emptyIndex();
        int version = copy.getVersion() > 0 ? copy.getVersion() : 1;
        String defaultId = copy.getDefaultProjectId() != null && !copy.getDefaultProjectId().isBlank()
                ? copy.getDefaultProjectId()
                : ProjectIds.DEFAULT;
        int updated = jdbc.update(
                "UPDATE dw_project_index SET version = ?, default_project_id = ? WHERE tenant_id = ?",
                version,
                defaultId,
                tid);
        if (updated == 0) {
            jdbc.update(
                    "INSERT INTO dw_project_index (tenant_id, version, default_project_id) VALUES (?,?,?)",
                    tid,
                    version,
                    defaultId);
        }
        jdbc.update("DELETE FROM dw_projects WHERE tenant_id = ?", tid);
        if (copy.getProjects() != null) {
            for (ProjectEntity project : copy.getProjects()) {
                if (project != null && project.getId() != null && !project.getId().isBlank()) {
                    insertProject(tid, project);
                    ensureProjectDirs(tid, project.getId());
                }
            }
        }
    }

    @Override
    public List<ProjectEntity> listProjects(String tenantId) {
        String tid = TenantIds.normalizeOrDefault(tenantId);
        return jdbc.query(
                "SELECT * FROM dw_projects WHERE tenant_id = ? ORDER BY id",
                projectMapper(),
                tid);
    }

    @Override
    public Optional<ProjectEntity> findProject(String tenantId, String projectId) {
        if (projectId == null || projectId.isBlank()) {
            return Optional.empty();
        }
        String tid = TenantIds.normalizeOrDefault(tenantId);
        List<ProjectEntity> rows = jdbc.query(
                "SELECT * FROM dw_projects WHERE tenant_id = ? AND id = ?",
                projectMapper(),
                tid,
                projectId.trim());
        return rows.stream().findFirst();
    }

    @Override
    public synchronized ProjectEntity upsertProject(String tenantId, ProjectEntity project) {
        Objects.requireNonNull(project.getId(), "project id required");
        String tid = TenantIds.normalizeOrDefault(tenantId);
        ensureIndexRow(tid);
        int updated = jdbc.update(
                """
                        UPDATE dw_projects SET name=?, color_key=?, description=?, created_at=?, updated_at=?,
                        archived=?, docs_dir=?, scripts_dir=?, default_env=?, template_id=? WHERE tenant_id=? AND id=?
                        """,
                project.getName(),
                project.getColorKey(),
                project.getDescription(),
                toTimestamp(project.getCreatedAt()),
                toTimestamp(project.getUpdatedAt()),
                project.isArchived(),
                project.getDocsDir() != null ? project.getDocsDir() : "docs",
                project.getScriptsDir() != null ? project.getScriptsDir() : "scripts",
                project.getDefaultEnv(),
                project.getTemplateId(),
                tid,
                project.getId());
        if (updated == 0) {
            insertProject(tid, project);
        }
        ensureProjectDirs(tid, project.getId());
        return project;
    }

    @Override
    public synchronized void deleteProject(String tenantId, String projectId) {
        if (projectId == null || projectId.isBlank()) {
            return;
        }
        String id = projectId.trim();
        if (ProjectIds.DEFAULT.equals(id)) {
            throw new IllegalArgumentException("PROJECT_DEFAULT_IMMUTABLE");
        }
        String tid = TenantIds.normalizeOrDefault(tenantId);
        jdbc.update("DELETE FROM dw_projects WHERE tenant_id = ? AND id = ?", tid, id);
        ensureIndexRow(tid);
        ProjectIndexDocument index = loadIndex(tid);
        if (id.equals(index.getDefaultProjectId())) {
            jdbc.update(
                    "UPDATE dw_project_index SET default_project_id = ? WHERE tenant_id = ?",
                    ProjectIds.DEFAULT,
                    tid);
        }
    }

    @Override
    public ActiveProjectDocument loadActiveProject(long userId, String tenantId) {
        String tid = TenantIds.normalizeOrDefault(tenantId);
        List<String> rows = jdbc.query(
                "SELECT project_id FROM dw_user_active_projects WHERE user_id = ? AND tenant_id = ?",
                (rs, rowNum) -> rs.getString("project_id"),
                userId,
                tid);
        if (rows.isEmpty() || rows.get(0) == null || rows.get(0).isBlank()) {
            return new ActiveProjectDocument(ProjectIds.DEFAULT);
        }
        return new ActiveProjectDocument(rows.get(0).trim());
    }

    @Override
    public void saveActiveProject(long userId, String tenantId, ActiveProjectDocument document) {
        String tid = TenantIds.normalizeOrDefault(tenantId);
        String projectId = ProjectIds.normalizeOrDefault(document != null ? document.getProjectId() : null);
        Instant now = Instant.now();
        int updated = jdbc.update(
                "UPDATE dw_user_active_projects SET project_id = ?, updated_at = ? WHERE user_id = ? AND tenant_id = ?",
                projectId,
                toTimestamp(now),
                userId,
                tid);
        if (updated == 0) {
            jdbc.update(
                    "INSERT INTO dw_user_active_projects (user_id, tenant_id, project_id, updated_at) VALUES (?,?,?,?)",
                    userId,
                    tid,
                    projectId,
                    toTimestamp(now));
        }
    }

    @Override
    public synchronized String ensureDefaultProject(String tenantId) {
        String tid = TenantIds.normalizeOrDefault(tenantId);
        ensureIndexRow(tid);
        Optional<ProjectEntity> existing = findProject(tid, ProjectIds.DEFAULT);
        Instant now = Instant.now();
        if (existing.isEmpty()) {
            ProjectEntity def = new ProjectEntity();
            def.setId(ProjectIds.DEFAULT);
            def.setName(ProjectIds.DEFAULT_DISPLAY_NAME);
            def.setColorKey("slate");
            def.setDescription("");
            def.setCreatedAt(now);
            def.setUpdatedAt(now);
            def.setArchived(false);
            def.setDocsDir("docs");
            def.setScriptsDir("scripts");
            upsertProject(tid, def);
        } else {
            ensureProjectDirs(tid, ProjectIds.DEFAULT);
        }
        jdbc.update(
                "UPDATE dw_project_index SET default_project_id = ? WHERE tenant_id = ?",
                ProjectIds.DEFAULT,
                tid);
        return ProjectIds.DEFAULT;
    }

    private void insertProject(String tenantId, ProjectEntity project) {
        jdbc.update(
                """
                        INSERT INTO dw_projects (
                          tenant_id, id, name, color_key, description, created_at, updated_at,
                          archived, docs_dir, scripts_dir, default_env, template_id
                        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                        """,
                tenantId,
                project.getId(),
                project.getName(),
                project.getColorKey(),
                project.getDescription(),
                toTimestamp(project.getCreatedAt()),
                toTimestamp(project.getUpdatedAt()),
                project.isArchived(),
                project.getDocsDir() != null ? project.getDocsDir() : "docs",
                project.getScriptsDir() != null ? project.getScriptsDir() : "scripts",
                project.getDefaultEnv(),
                project.getTemplateId());
    }

    private void ensureIndexRow(String tenantId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM dw_project_index WHERE tenant_id = ?",
                Integer.class,
                tenantId);
        if (count == null || count == 0) {
            jdbc.update(
                    "INSERT INTO dw_project_index (tenant_id, version, default_project_id) VALUES (?,?,?)",
                    tenantId,
                    1,
                    ProjectIds.DEFAULT);
        }
    }

    private void ensureProjectDirs(String tenantId, String projectId) {
        Path root = configDirectory.resolve(ConfigPaths.tenantProjectDir(tenantId, projectId));
        try {
            Files.createDirectories(root.resolve("docs"));
            Files.createDirectories(root.resolve("scripts"));
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to create project directories for " + projectId, ex);
        }
    }

    private static ProjectIndexDocument emptyIndex() {
        ProjectIndexDocument doc = new ProjectIndexDocument();
        doc.setVersion(1);
        doc.setProjects(new ArrayList<>());
        doc.setDefaultProjectId(ProjectIds.DEFAULT);
        return doc;
    }

    private static Timestamp toTimestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }
}
