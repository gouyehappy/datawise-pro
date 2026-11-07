package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.io.JsonSnapshotFile;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.ActiveProjectDocument;
import org.apache.datawise.backend.model.ProjectEntity;
import org.apache.datawise.backend.model.ProjectIndexDocument;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 项目索引与活动项目（file storage backend）。
 */
@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "file", matchIfMissing = true)
public class FileProjectStore implements ProjectStore {

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final ConcurrentHashMap<String, JsonSnapshotFile<ProjectIndexDocument>> indexByTenant =
            new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, JsonSnapshotFile<ActiveProjectDocument>> activeByUserTenant =
            new ConcurrentHashMap<>();

    public FileProjectStore(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
    }

    @Override
    public ProjectIndexDocument loadIndex(String tenantId) {
        return copyIndex(indexFile(tenantId).get());
    }

    @Override
    public synchronized void saveIndex(String tenantId, ProjectIndexDocument index) {
        indexFile(tenantId).replace(copyIndex(index));
    }

    @Override
    public List<ProjectEntity> listProjects(String tenantId) {
        return new ArrayList<>(loadIndex(tenantId).getProjects());
    }

    @Override
    public Optional<ProjectEntity> findProject(String tenantId, String projectId) {
        if (projectId == null || projectId.isBlank()) {
            return Optional.empty();
        }
        String id = projectId.trim();
        return listProjects(tenantId).stream().filter(p -> id.equals(p.getId())).findFirst();
    }

    @Override
    public synchronized ProjectEntity upsertProject(String tenantId, ProjectEntity project) {
        Objects.requireNonNull(project.getId(), "project id required");
        ProjectIndexDocument index = loadIndex(tenantId);
        List<ProjectEntity> next = new ArrayList<>();
        boolean replaced = false;
        for (ProjectEntity existing : index.getProjects()) {
            if (project.getId().equals(existing.getId())) {
                next.add(project);
                replaced = true;
            } else {
                next.add(existing);
            }
        }
        if (!replaced) {
            next.add(project);
        }
        index.setProjects(next);
        if (index.getDefaultProjectId() == null || index.getDefaultProjectId().isBlank()) {
            index.setDefaultProjectId(ProjectIds.DEFAULT);
        }
        saveIndex(tenantId, index);
        ensureProjectDirs(tenantId, project.getId());
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
        ProjectIndexDocument index = loadIndex(tenantId);
        List<ProjectEntity> next = index.getProjects().stream()
                .filter(p -> p.getId() == null || !id.equals(p.getId()))
                .toList();
        index.setProjects(new ArrayList<>(next));
        if (id.equals(index.getDefaultProjectId())) {
            index.setDefaultProjectId(ProjectIds.DEFAULT);
        }
        saveIndex(tenantId, index);
    }

    @Override
    public ActiveProjectDocument loadActiveProject(long userId, String tenantId) {
        return activeFile(userId, tenantId).get();
    }

    @Override
    public void saveActiveProject(long userId, String tenantId, ActiveProjectDocument document) {
        activeFile(userId, tenantId).replace(
                document != null ? document : new ActiveProjectDocument(ProjectIds.DEFAULT));
    }

    @Override
    public synchronized String ensureDefaultProject(String tenantId) {
        String tid = TenantIds.normalizeOrDefault(tenantId);
        ProjectIndexDocument index = loadIndex(tid);
        Optional<ProjectEntity> existing = index.getProjects().stream()
                .filter(p -> ProjectIds.DEFAULT.equals(p.getId()))
                .findFirst();
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
            List<ProjectEntity> projects = new ArrayList<>(index.getProjects());
            projects.add(0, def);
            index.setProjects(projects);
        }
        index.setDefaultProjectId(ProjectIds.DEFAULT);
        if (index.getVersion() <= 0) {
            index.setVersion(1);
        }
        saveIndex(tid, index);
        ensureProjectDirs(tid, ProjectIds.DEFAULT);
        return ProjectIds.DEFAULT;
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

    private JsonSnapshotFile<ProjectIndexDocument> indexFile(String tenantId) {
        String tid = TenantIds.normalizeOrDefault(tenantId);
        return indexByTenant.computeIfAbsent(tid, id -> new JsonSnapshotFile<>(
                configDirectory,
                objectMapper,
                ConfigPaths.tenantProjectsIndex(id),
                ProjectIndexDocument.class,
                emptyIndex()));
    }

    private JsonSnapshotFile<ActiveProjectDocument> activeFile(long userId, String tenantId) {
        String tid = TenantIds.normalizeOrDefault(tenantId);
        String key = userId + ":" + tid;
        return activeByUserTenant.computeIfAbsent(key, ignored -> new JsonSnapshotFile<>(
                configDirectory,
                objectMapper,
                ConfigPaths.userActiveProject(userId, tid),
                ActiveProjectDocument.class,
                new ActiveProjectDocument(ProjectIds.DEFAULT)));
    }

    private static ProjectIndexDocument emptyIndex() {
        ProjectIndexDocument doc = new ProjectIndexDocument();
        doc.setVersion(1);
        doc.setProjects(new ArrayList<>());
        doc.setDefaultProjectId(ProjectIds.DEFAULT);
        return doc;
    }

    private static ProjectIndexDocument copyIndex(ProjectIndexDocument source) {
        ProjectIndexDocument copy = emptyIndex();
        if (source == null) {
            return copy;
        }
        copy.setVersion(source.getVersion() > 0 ? source.getVersion() : 1);
        copy.setDefaultProjectId(
                source.getDefaultProjectId() != null && !source.getDefaultProjectId().isBlank()
                        ? source.getDefaultProjectId()
                        : ProjectIds.DEFAULT);
        List<ProjectEntity> projects = new ArrayList<>();
        if (source.getProjects() != null) {
            for (ProjectEntity p : source.getProjects()) {
                if (p != null) {
                    projects.add(copyProject(p));
                }
            }
        }
        copy.setProjects(projects);
        return copy;
    }

    private static ProjectEntity copyProject(ProjectEntity source) {
        ProjectEntity copy = new ProjectEntity();
        copy.setId(source.getId());
        copy.setName(source.getName());
        copy.setColorKey(source.getColorKey());
        copy.setDescription(source.getDescription());
        copy.setCreatedAt(source.getCreatedAt());
        copy.setUpdatedAt(source.getUpdatedAt());
        copy.setArchived(source.isArchived());
        copy.setDocsDir(source.getDocsDir() != null ? source.getDocsDir() : "docs");
        copy.setScriptsDir(source.getScriptsDir() != null ? source.getScriptsDir() : "scripts");
        copy.setDefaultEnv(source.getDefaultEnv());
        copy.setTemplateId(source.getTemplateId());
        return copy;
    }
}
