package org.apache.datawise.backend.service.project;

import org.apache.datawise.backend.common.support.ConfigPathSandbox;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.ProjectStore;
import org.apache.datawise.backend.domain.ProjectDeleteRequest;
import org.apache.datawise.backend.domain.ProjectFileContentDto;
import org.apache.datawise.backend.domain.ProjectFileEntryDto;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.domain.ProjectMkdirRequest;
import org.apache.datawise.backend.domain.ProjectRenameRequest;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.ProjectEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;

/**
 * 项目 docs/scripts 文件沙箱读写（相对项目根，禁止逃逸）。
 */
@Service
public class ProjectFilesService {

    public static final String ROOT_DOCS = "docs";
    public static final String ROOT_SCRIPTS = "scripts";

    private final ConfigDirectoryService configDirectory;
    private final ProjectStore projectStore;
    private final ProjectService projectService;
    private final UserAccessPolicy userAccessPolicy;

    public ProjectFilesService(
                               ConfigDirectoryService configDirectory,
                               ProjectStore projectStore,
                               ProjectService projectService,
                               UserAccessPolicy userAccessPolicy) {
        this.configDirectory = configDirectory;
        this.projectStore = projectStore;
        this.projectService = projectService;
        this.userAccessPolicy = userAccessPolicy;
    }

    public List<ProjectFileEntryDto> list(String projectId, String root, String relativePath) {
        Path rootPath = resolveRoot(projectId, root);
        Path dir = resolveInsideRoot(projectId, root, blankToDot(relativePath));
        if (!Files.isDirectory(dir)) {
            throw new IllegalArgumentException("PROJECT_DIR_NOT_FOUND");
        }
        List<ProjectFileEntryDto> entries = new ArrayList<>();
        try (Stream<Path> stream = Files.list(dir)) {
            stream.forEach(path -> {
                String name = path.getFileName() != null ? path.getFileName().toString() : "";
                if (name.isBlank() || name.startsWith(".")) {
                    return;
                }
                boolean directory = Files.isDirectory(path);
                Long size = null;
                String updatedAt = null;
                try {
                    if (!directory) {
                        size = Files.size(path);
                    }
                    FileTime mtime = Files.getLastModifiedTime(path);
                    updatedAt = mtime.toInstant().toString();
                } catch (IOException ignored) {
                    // best-effort metadata
                }
                entries.add(new ProjectFileEntryDto(
                        name,
                        relativize(rootPath, path),
                        directory,
                        size,
                        updatedAt));
            });
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to list project files", ex);
        }
        entries.sort(Comparator
                .comparing(ProjectFileEntryDto::directory).reversed()
                .thenComparing(e -> e.name().toLowerCase(Locale.ROOT)));
        return entries;
    }

    public ProjectFileContentDto read(String projectId, String root, String relativePath) {
        Path rootPath = resolveRoot(projectId, root);
        Path file = resolveInsideRoot(projectId, root, requireRelativeFile(relativePath));
        if (!Files.isRegularFile(file)) {
            throw new IllegalArgumentException("PROJECT_FILE_NOT_FOUND");
        }
        try {
            String content = Files.readString(file, StandardCharsets.UTF_8);
            return new ProjectFileContentDto(normalizeRoot(root), relativize(rootPath, file), content);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read project file", ex);
        }
    }

    public ProjectFileContentDto write(String projectId, ProjectFileContentDto request) {
        userAccessPolicy.requireRegisteredUser();
        if (request == null) {
            throw new IllegalArgumentException("request body is required");
        }
        String root = normalizeRoot(request.root());
        String relativePath = requireRelativeFile(request.path());
        Path rootPath = resolveRoot(projectId, root);
        Path file = resolveInsideRoot(projectId, root, relativePath);
        try {
            Path parent = file.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            String content = request.content() != null ? request.content() : "";
            Files.writeString(file, content, StandardCharsets.UTF_8);
            return new ProjectFileContentDto(root, relativize(rootPath, file), content);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to write project file", ex);
        }
    }

    public ProjectFileEntryDto mkdir(String projectId, ProjectMkdirRequest request) {
        userAccessPolicy.requireRegisteredUser();
        if (request == null) {
            throw new IllegalArgumentException("request body is required");
        }
        String root = normalizeRoot(request.root());
        String relativePath = requireRelativeFile(request.path());
        Path rootPath = resolveRoot(projectId, root);
        Path dir = resolveInsideRoot(projectId, root, relativePath);
        try {
            Files.createDirectories(dir);
            return new ProjectFileEntryDto(
                    dir.getFileName() != null ? dir.getFileName().toString() : relativePath,
                    relativize(rootPath, dir),
                    true,
                    null,
                    Instant.now().toString());
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to create project directory", ex);
        }
    }

    public void delete(String projectId, ProjectDeleteRequest request) {
        userAccessPolicy.requireRegisteredUser();
        if (request == null) {
            throw new IllegalArgumentException("request body is required");
        }
        String root = normalizeRoot(request.root());
        String relativePath = requireRelativeFile(request.path());
        Path rootPath = resolveRoot(projectId, root);
        Path target = resolveInsideRoot(projectId, root, relativePath);
        if (target.equals(rootPath)) {
            throw new IllegalArgumentException("PROJECT_ROOT_DELETE_FORBIDDEN");
        }
        if (!Files.exists(target)) {
            throw new IllegalArgumentException("PROJECT_FILE_NOT_FOUND");
        }
        try {
            if (Files.isDirectory(target)) {
                deleteDirectoryRecursively(target);
            } else {
                Files.delete(target);
            }
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to delete project file", ex);
        }
    }

    public ProjectFileEntryDto rename(String projectId, ProjectRenameRequest request) {
        userAccessPolicy.requireRegisteredUser();
        if (request == null) {
            throw new IllegalArgumentException("request body is required");
        }
        String root = normalizeRoot(request.root());
        String fromPath = requireRelativeFile(request.fromPath());
        String toPath = requireRelativeFile(request.toPath());
        if (fromPath.equals(toPath)) {
            Path same = resolveInsideRoot(projectId, root, fromPath);
            boolean directory = Files.isDirectory(same);
            if (!directory && !Files.isRegularFile(same)) {
                throw new IllegalArgumentException("PROJECT_FILE_NOT_FOUND");
            }
            Path rootPath = resolveRoot(projectId, root);
            return new ProjectFileEntryDto(
                    same.getFileName() != null ? same.getFileName().toString() : toPath,
                    relativize(rootPath, same),
                    directory,
                    null,
                    Instant.now().toString());
        }
        Path rootPath = resolveRoot(projectId, root);
        Path from = resolveInsideRoot(projectId, root, fromPath);
        Path to = resolveInsideRoot(projectId, root, toPath);
        if (!Files.exists(from)) {
            throw new IllegalArgumentException("PROJECT_FILE_NOT_FOUND");
        }
        if (Files.exists(to)) {
            throw new IllegalArgumentException("PROJECT_FILE_EXISTS");
        }
        try {
            Path parent = to.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            Files.move(from, to);
            boolean directory = Files.isDirectory(to);
            Long size = null;
            if (!directory) {
                try {
                    size = Files.size(to);
                } catch (IOException ignored) {
                    // best-effort
                }
            }
            return new ProjectFileEntryDto(
                    to.getFileName() != null ? to.getFileName().toString() : toPath,
                    relativize(rootPath, to),
                    directory,
                    size,
                    Instant.now().toString());
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to rename project file", ex);
        }
    }

    Path resolveRoot(String projectId, String root) {
        String tid = TenantIds.normalizeOrDefault(UserContext.getTenantId());
        projectService.ensureMigrated(tid);
        String id = ProjectIds.normalizeOrDefault(projectId);
        ProjectEntity project = projectStore.findProject(tid, id)
                .orElseThrow(() -> new IllegalArgumentException("PROJECT_NOT_FOUND"));
        String rootName = normalizeRoot(root);
        String configured = ROOT_DOCS.equals(rootName)
                ? (project.getDocsDir() != null && !project.getDocsDir().isBlank() ? project.getDocsDir() : ROOT_DOCS)
                : (project.getScriptsDir() != null && !project.getScriptsDir().isBlank() ? project.getScriptsDir() : ROOT_SCRIPTS);
        Path projectRoot = configDirectory.resolve(ConfigPaths.tenantProjectDir(tid, id)).toAbsolutePath().normalize();
        Path resolved = ConfigPathSandbox.resolveInside(projectRoot, configured);
        try {
            Files.createDirectories(resolved);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to ensure project " + rootName + " directory", ex);
        }
        return resolved;
    }

    Path resolveInsideRoot(String projectId, String root, String relativePath) {
        Path rootPath = resolveRoot(projectId, root);
        if (relativePath == null || relativePath.isBlank() || ".".equals(relativePath.trim())) {
            return rootPath;
        }
        return ConfigPathSandbox.resolveInside(rootPath, relativePath.trim().replace('\\', '/'));
    }

    static String normalizeRoot(String root) {
        if (root == null || root.isBlank()) {
            throw new IllegalArgumentException("root is required (docs|scripts)");
        }
        String normalized = root.trim().toLowerCase(Locale.ROOT);
        if (!ROOT_DOCS.equals(normalized) && !ROOT_SCRIPTS.equals(normalized)) {
            throw new IllegalArgumentException("root must be docs or scripts");
        }
        return normalized;
    }

    private static void deleteDirectoryRecursively(Path directory) throws IOException {
        Files.walkFileTree(directory, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                Files.delete(file);
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult postVisitDirectory(Path dir, IOException exc) throws IOException {
                if (exc != null) {
                    throw exc;
                }
                Files.delete(dir);
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private static String requireRelativeFile(String path) {
        if (path == null || path.isBlank()) {
            throw new IllegalArgumentException("path is required");
        }
        return path.trim().replace('\\', '/');
    }

    private static String blankToDot(String path) {
        if (path == null || path.isBlank() || ".".equals(path.trim())) {
            return ".";
        }
        return path.trim().replace('\\', '/');
    }

    private static String relativize(Path root, Path target) {
        String rel = root.toAbsolutePath().normalize().relativize(target.toAbsolutePath().normalize())
                .toString()
                .replace('\\', '/');
        return rel.isBlank() ? "" : rel;
    }
}
