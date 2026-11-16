package org.apache.datawise.backend.service.project;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.support.ConfigPathSandbox;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.ProjectStore;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.domain.ProjectDeleteRequest;
import org.apache.datawise.backend.domain.ProjectFileContentDto;
import org.apache.datawise.backend.domain.ProjectFileEntryDto;
import org.apache.datawise.backend.domain.ProjectFileShareDto;
import org.apache.datawise.backend.domain.ProjectFileShareRequest;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.domain.ProjectMkdirRequest;
import org.apache.datawise.backend.domain.ProjectRenameRequest;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.ProjectEntity;
import org.apache.datawise.backend.model.UserEntity;
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
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * 项目 docs/scripts 文件沙箱读写（禁止逃逸）。
 * <p>
 * 只有两个 root（{@code docs} / {@code scripts}），内容按创建者账号物理隔离：
 * {@code tenants/{tid}/projects/{pid}/users/u{userId}/docs|scripts}，与连接 userId 归属一致。
 * <p>
 * 团队共享不是另建一份目录，而是把**私有区里的某个目录**标记到项目级
 * {@code file-shares.json} 清单里。其它账号在对应 root 下看到的是一个引用节点，
 * 虚拟路径格式为 {@code @shared/u{ownerId}/{ownerRelativePath}}，读写直接落到归属账号
 * 的原目录上，不复制文件。引用路径必须落在清单里的共享范围内，防止靠猜路径读别人的私有文件。
 * 访客看不到任何注册用户的文件。
 */
@Service
public class ProjectFilesService {

    public static final String ROOT_DOCS = "docs";
    public static final String ROOT_SCRIPTS = "scripts";

    /** 共享引用节点在树里的虚拟路径前缀。 */
    public static final String SHARED_REF_PREFIX = "@shared";
    private static final Pattern SHARED_REF = Pattern.compile("^@shared/u(\\d+)(?:/(.*))?$");

    private final ConfigDirectoryService configDirectory;
    private final ProjectStore projectStore;
    private final ProjectService projectService;
    private final UserAccessPolicy userAccessPolicy;
    private final UserStore userStore;
    private final ObjectMapper objectMapper;
    /** 已完成历史数据归属迁移的 tenant:project，避免每次列目录都扫描磁盘。 */
    private final Set<String> migratedLegacyProjects = ConcurrentHashMap.newKeySet();
    /** 已为 tenant:project 跑过历史迁移的组合。 */
    private final Set<String> ensuredRootScopes = ConcurrentHashMap.newKeySet();
    private final Object shareLock = new Object();

    public ProjectFilesService(
                               ConfigDirectoryService configDirectory,
                               ProjectStore projectStore,
                               ProjectService projectService,
                               UserAccessPolicy userAccessPolicy,
                               UserStore userStore,
                               ObjectMapper objectMapper) {
        this.configDirectory = configDirectory;
        this.projectStore = projectStore;
        this.projectService = projectService;
        this.userAccessPolicy = userAccessPolicy;
        this.userStore = userStore;
        this.objectMapper = objectMapper;
    }

    // ------------------------------------------------------------------ 读写

    public List<ProjectFileEntryDto> list(String projectId, String root, String relativePath) {
        if (userAccessPolicy.isGuestSession()) {
            return List.of();
        }
        Target target = resolveTarget(projectId, root, relativePath);
        Path dir = pathOf(target);
        if (!Files.isDirectory(dir)) {
            throw new IllegalArgumentException("PROJECT_DIR_NOT_FOUND");
        }
        List<ProjectFileShareDto> shares = loadShares(target.scope());
        Set<String> ownSharedDirs = new HashSet<>();
        for (ProjectFileShareDto share : shares) {
            if (share.ownerUserId() == target.scope().userId() && target.root().equals(share.root())) {
                ownSharedDirs.add(share.path());
            }
        }
        // 只有根层注入的引用节点带来源账号名；引用目录内部的文件不再重复标注。
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
                String rel = relativize(target.physicalRoot(), path);
                boolean shared = target.sharedRef() || (directory && ownSharedDirs.contains(rel));
                entries.add(new ProjectFileEntryDto(
                        name,
                        target.virtualPrefix() + rel,
                        directory,
                        size,
                        updatedAt,
                        shared,
                        null));
            });
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to list project files", ex);
        }

        // 私有 root 顶层额外挂上「其它账号共享给我的目录」，不新建任何共享大目录。
        if (!target.sharedRef() && target.subPath().isEmpty()) {
            for (ProjectFileShareDto share : shares) {
                if (share.ownerUserId() == target.scope().userId()
                        || !target.root().equals(share.root())) {
                    continue;
                }
                Path sharedDir = ownerRoot(target.scope(), share.ownerUserId(), target.dirName(), false)
                        .resolve(share.path()).normalize();
                if (!sharedDir.startsWith(ownerRoot(target.scope(), share.ownerUserId(), target.dirName(), false))
                        || !Files.isDirectory(sharedDir)) {
                    continue;
                }
                entries.add(new ProjectFileEntryDto(
                        lastPathSegment(share.path()),
                        SHARED_REF_PREFIX + "/u" + share.ownerUserId() + "/" + share.path(),
                        true,
                        null,
                        null,
                        true,
                        displayName(share)));
            }
        }

        entries.sort(Comparator
                .comparing(ProjectFileEntryDto::directory).reversed()
                .thenComparing(e -> e.name().toLowerCase(Locale.ROOT))
                .thenComparing(ProjectFileEntryDto::path));
        return entries;
    }

    public ProjectFileContentDto read(String projectId, String root, String relativePath) {
        if (userAccessPolicy.isGuestSession()) {
            throw new IllegalArgumentException("PROJECT_FILE_NOT_FOUND");
        }
        Target target = resolveTarget(projectId, root, requireRelativeFile(relativePath));
        Path file = pathOf(target);
        if (!Files.isRegularFile(file)) {
            throw new IllegalArgumentException("PROJECT_FILE_NOT_FOUND");
        }
        try {
            String content = Files.readString(file, StandardCharsets.UTF_8);
            return new ProjectFileContentDto(target.root(), virtualPath(target, file), content);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read project file", ex);
        }
    }

    public ProjectFileContentDto write(String projectId, ProjectFileContentDto request) {
        userAccessPolicy.requireRegisteredUser();
        if (request == null) {
            throw new IllegalArgumentException("request body is required");
        }
        Target target = resolveTarget(projectId, request.root(), requireRelativeFile(request.path()));
        Path file = pathOf(target);
        try {
            Path parent = file.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            String content = request.content() != null ? request.content() : "";
            Files.writeString(file, content, StandardCharsets.UTF_8);
            return new ProjectFileContentDto(target.root(), virtualPath(target, file), content);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to write project file", ex);
        }
    }

    public ProjectFileEntryDto mkdir(String projectId, ProjectMkdirRequest request) {
        userAccessPolicy.requireRegisteredUser();
        if (request == null) {
            throw new IllegalArgumentException("request body is required");
        }
        Target target = resolveTarget(projectId, request.root(), requireRelativeFile(request.path()));
        Path dir = pathOf(target);
        try {
            Files.createDirectories(dir);
            return new ProjectFileEntryDto(
                    dir.getFileName() != null ? dir.getFileName().toString() : target.subPath(),
                    virtualPath(target, dir),
                    true,
                    null,
                    Instant.now().toString(),
                    target.sharedRef(),
                    null);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to create project directory", ex);
        }
    }

    public void delete(String projectId, ProjectDeleteRequest request) {
        userAccessPolicy.requireRegisteredUser();
        if (request == null) {
            throw new IllegalArgumentException("request body is required");
        }
        Target target = resolveTarget(projectId, request.root(), requireRelativeFile(request.path()));
        Path toDelete = pathOf(target);
        if (toDelete.equals(target.physicalRoot())) {
            throw new IllegalArgumentException("PROJECT_ROOT_DELETE_FORBIDDEN");
        }
        // 别人共享出来的目录本体只能由归属账号在自己的私有树里删除/取消共享。
        if (target.sharedRef()
                && target.ownerId() != target.scope().userId()
                && isSharedRoot(target.scope(), target.root(), target.ownerId(), target.subPath())) {
            throw new IllegalArgumentException("PROJECT_SHARE_DELETE_FORBIDDEN");
        }
        if (!Files.exists(toDelete)) {
            throw new IllegalArgumentException("PROJECT_FILE_NOT_FOUND");
        }
        try {
            if (Files.isDirectory(toDelete)) {
                deleteDirectoryRecursively(toDelete);
            } else {
                Files.delete(toDelete);
            }
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to delete project file", ex);
        }
        if (!target.sharedRef()) {
            pruneShares(target.scope(), target.root(), target.subPath());
        }
    }

    public ProjectFileEntryDto rename(String projectId, ProjectRenameRequest request) {
        userAccessPolicy.requireRegisteredUser();
        if (request == null) {
            throw new IllegalArgumentException("request body is required");
        }
        Target from = resolveTarget(projectId, request.root(), requireRelativeFile(request.fromPath()));
        Target to = resolveTarget(projectId, request.root(), requireRelativeFile(request.toPath()));
        // 不允许把文件从私有区拖进别人的共享目录（或反过来）：两者物理根不同。
        if (from.ownerId() != to.ownerId() || from.sharedRef() != to.sharedRef()) {
            throw new IllegalArgumentException("PROJECT_CROSS_SCOPE_MOVE");
        }
        // 别人共享出来的目录本体只能由归属账号改名（否则共享清单会指向不存在的路径）。
        if (from.sharedRef()
                && from.ownerId() != from.scope().userId()
                && isSharedRoot(from.scope(), from.root(), from.ownerId(), from.subPath())) {
            throw new IllegalArgumentException("PROJECT_SHARE_DELETE_FORBIDDEN");
        }
        Path source = pathOf(from);
        Path destination = pathOf(to);
        if (!Files.exists(source)) {
            throw new IllegalArgumentException("PROJECT_FILE_NOT_FOUND");
        }
        if (Files.exists(destination) && !source.equals(destination)) {
            throw new IllegalArgumentException("PROJECT_FILE_EXISTS");
        }
        boolean directory = Files.isDirectory(source);
        if (!source.equals(destination)) {
            try {
                Path parent = destination.getParent();
                if (parent != null) {
                    Files.createDirectories(parent);
                }
                Files.move(source, destination);
            } catch (IOException ex) {
                throw new IllegalStateException("Failed to rename project file", ex);
            }
        }
        if (!from.sharedRef()) {
            renameShares(from.scope(), from.root(), from.subPath(), to.subPath());
        }
        Long size = null;
        if (!directory) {
            try {
                size = Files.size(destination);
            } catch (IOException ignored) {
                // best-effort
            }
        }
        return new ProjectFileEntryDto(
                destination.getFileName() != null ? destination.getFileName().toString() : to.subPath(),
                virtualPath(to, destination),
                directory,
                size,
                Instant.now().toString(),
                to.sharedRef(),
                null);
    }

    // ------------------------------------------------------------------ 共享

    /** 当前项目里所有生效的共享记录（游客返回空）。 */
    public List<ProjectFileShareDto> listShares(String projectId) {
        if (userAccessPolicy.isGuestSession()) {
            return List.of();
        }
        return loadShares(resolveScope(projectId));
    }

    /** 把自己私有区里的某个目录共享给项目内其它注册账号。 */
    public ProjectFileShareDto share(String projectId, ProjectFileShareRequest request) {
        userAccessPolicy.requireRegisteredUser();
        if (request == null) {
            throw new IllegalArgumentException("request body is required");
        }
        String root = normalizeRoot(request.root());
        String rel = requireRelativeFile(request.path());
        if (rel.equals(SHARED_REF_PREFIX) || rel.startsWith(SHARED_REF_PREFIX + "/")) {
            throw new IllegalArgumentException("PROJECT_SHARE_FORBIDDEN");
        }
        ProjectScope scope = resolveScope(projectId);
        ensureRoots(scope);
        Path privateRoot = ownerRoot(scope, scope.userId(), dirName(root, scope.project()), false);
        Path dir = ConfigPathSandbox.resolveInside(privateRoot, rel);
        if (!dir.startsWith(privateRoot) || !Files.isDirectory(dir)) {
            throw new IllegalArgumentException("PROJECT_DIR_NOT_FOUND");
        }
        synchronized (shareLock) {
            List<ProjectFileShareDto> shares = loadShares(scope);
            for (ProjectFileShareDto existing : shares) {
                if (isOwn(existing, root, rel, scope)) {
                    return existing;
                }
                if (existing.ownerUserId() == scope.userId()
                        && root.equals(existing.root())
                        && rel.startsWith(existing.path() + "/")) {
                    throw new IllegalArgumentException("PROJECT_SHARE_NESTED");
                }
            }
            // 共享父目录时，移除其下重复的子目录共享记录。
            shares.removeIf(item -> item.ownerUserId() == scope.userId()
                    && root.equals(item.root())
                    && item.path().startsWith(rel + "/"));
            ProjectFileShareDto added = new ProjectFileShareDto(
                    scope.userId(),
                    currentUsername(scope),
                    root,
                    rel,
                    Instant.now().toString());
            shares.add(added);
            saveShares(scope, shares);
            return added;
        }
    }

    /** 取消自己共享出去的目录；只能取消自己的记录。 */
    public void unshare(String projectId, ProjectFileShareRequest request) {
        userAccessPolicy.requireRegisteredUser();
        if (request == null) {
            throw new IllegalArgumentException("request body is required");
        }
        String root = normalizeRoot(request.root());
        String rel = requireRelativeFile(request.path());
        ProjectScope scope = resolveScope(projectId);
        synchronized (shareLock) {
            List<ProjectFileShareDto> shares = loadShares(scope);
            boolean removed = shares.removeIf(item -> isOwn(item, root, rel, scope));
            if (removed) {
                saveShares(scope, shares);
            }
        }
    }

    /**
     * 登录 / 切换项目后调用：为当前账号建好私有 docs、scripts 两个空目录。
     * 不复制任何文件；重复调用幂等，访客不创建。
     */
    public void ensureRootsForCurrentUser(String projectId) {
        if (userAccessPolicy.isGuestSession()) {
            return;
        }
        ensureRoots(resolveScope(projectId));
    }

    // ------------------------------------------------------------------ 路径解析

    private record ProjectScope(String tenantId, String projectId, ProjectEntity project, long userId) {
    }

    /**
     * 一次路径解析的结果。{@code virtualPrefix} 为 {@code @shared/u{id}/} 时表示
     * 正在访问别人共享出来的目录，物理根指向归属账号的私有目录。
     */
    private record Target(
                          ProjectScope scope,
                          String root,
                          String dirName,
                          Path physicalRoot,
                          String subPath,
                          String virtualPrefix,
                          long ownerId,
                          boolean sharedRef) {
    }

    private Target resolveTarget(String projectId, String root, String relativePath) {
        String key = normalizeRoot(root);
        ProjectScope scope = resolveScope(projectId);
        ensureRoots(scope);
        String dirName = dirName(key, scope.project());
        String rel = normalizeRelative(relativePath);

        if (rel.equals(SHARED_REF_PREFIX) || rel.startsWith(SHARED_REF_PREFIX + "/")) {
            Matcher matcher = SHARED_REF.matcher(rel);
            if (!matcher.matches()) {
                throw new IllegalArgumentException("PROJECT_SHARE_NOT_FOUND");
            }
            long ownerId = Long.parseLong(matcher.group(1));
            String sub = matcher.group(2) == null ? "" : matcher.group(2);
            if (ownerId != scope.userId() && !isWithinSharedScope(scope, key, ownerId, sub)) {
                throw new IllegalArgumentException("PROJECT_SHARE_NOT_FOUND");
            }
            Path owner = ownerRoot(scope, ownerId, dirName, false);
            return new Target(scope, key, dirName, owner, sub,
                    SHARED_REF_PREFIX + "/u" + ownerId + "/", ownerId, true);
        }

        Path own = ownerRoot(scope, scope.userId(), dirName, true);
        return new Target(scope, key, dirName, own, rel, "", scope.userId(), false);
    }

    private static Path pathOf(Target target) {
        return target.subPath().isEmpty()
                ? target.physicalRoot()
                : ConfigPathSandbox.resolveInside(target.physicalRoot(), target.subPath());
    }

    private static String virtualPath(Target target, Path physical) {
        String rel = relativize(target.physicalRoot(), physical);
        return target.virtualPrefix().isEmpty() ? rel : target.virtualPrefix() + rel;
    }

    private ProjectScope resolveScope(String projectId) {
        String tid = TenantIds.normalizeOrDefault(UserContext.getTenantId());
        projectService.ensureMigrated(tid);
        String id = ProjectIds.normalizeOrDefault(projectId);
        ProjectEntity project = projectStore.findProject(tid, id)
                .orElseThrow(() -> new IllegalArgumentException("PROJECT_NOT_FOUND"));
        long userId = UserContext.requireUserId();
        return new ProjectScope(tid, id, project, userId);
    }

    private void ensureRoots(ProjectScope scope) {
        String key = scope.tenantId() + ":" + scope.projectId();
        if (!ensuredRootScopes.contains(key)) {
            synchronized (ensuredRootScopes) {
                if (!ensuredRootScopes.contains(key)) {
                    // 历史项目级 docs/scripts 一次性归属给初始管理员。
                    migrateLegacyProjectFiles(
                            scope.tenantId(), scope.projectId(), scope.project(), scope.userId());
                    ensuredRootScopes.add(key);
                }
            }
        }
        // 目录可能被外部清理、或项目删除后同名重建，每次都兜底建齐当前账号的两个空目录。
        ownerRoot(scope, scope.userId(), docsDir(scope.project()), true);
        ownerRoot(scope, scope.userId(), scriptsDir(scope.project()), true);
    }

    private Path ownerRoot(ProjectScope scope, long userId, String dirName, boolean create) {
        Path base = configDirectory.resolve(ConfigPaths.tenantProjectUserDir(
                scope.tenantId(), scope.projectId(), userId)).toAbsolutePath().normalize();
        Path root = ConfigPathSandbox.resolveInside(base, dirName);
        if (create) {
            try {
                Files.createDirectories(root);
            } catch (IOException ex) {
                throw new IllegalStateException("Failed to ensure project " + dirName + " directory", ex);
            }
        }
        return root;
    }

    private static String dirName(String root, ProjectEntity project) {
        return ROOT_DOCS.equals(root) ? docsDir(project) : scriptsDir(project);
    }

    private static String docsDir(ProjectEntity project) {
        return configuredDir(project.getDocsDir(), ROOT_DOCS);
    }

    private static String scriptsDir(ProjectEntity project) {
        return configuredDir(project.getScriptsDir(), ROOT_SCRIPTS);
    }

    private static String configuredDir(String configured, String fallback) {
        return configured != null && !configured.isBlank() ? configured.trim() : fallback;
    }

    // ------------------------------------------------------------------ 共享清单

    private List<ProjectFileShareDto> loadShares(ProjectScope scope) {
        Path file = sharesFile(scope);
        if (!Files.isRegularFile(file)) {
            return new ArrayList<>();
        }
        try {
            List<ProjectFileShareDto> parsed = objectMapper.readValue(
                    Files.readString(file, StandardCharsets.UTF_8),
                    new TypeReference<List<ProjectFileShareDto>>() {
                    });
            return parsed == null ? new ArrayList<>() : new ArrayList<>(parsed);
        } catch (IOException ex) {
            // 清单损坏时按「没有共享」处理，不阻塞文件读写。
            return new ArrayList<>();
        }
    }

    private void saveShares(ProjectScope scope, List<ProjectFileShareDto> shares) {
        Path file = sharesFile(scope);
        try {
            Files.createDirectories(file.getParent());
            Files.writeString(file,
                    objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(shares),
                    StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to persist project file shares", ex);
        }
    }

    private Path sharesFile(ProjectScope scope) {
        return configDirectory.resolve(ConfigPaths.tenantProjectFileShares(
                scope.tenantId(), scope.projectId())).toAbsolutePath().normalize();
    }

    private boolean isWithinSharedScope(ProjectScope scope, String root, long ownerId, String subPath) {
        for (ProjectFileShareDto share : loadShares(scope)) {
            if (share.ownerUserId() != ownerId || !root.equals(share.root())) {
                continue;
            }
            if (subPath.equals(share.path()) || subPath.startsWith(share.path() + "/")) {
                return true;
            }
        }
        return false;
    }

    private boolean isSharedRoot(ProjectScope scope, String root, long ownerId, String subPath) {
        for (ProjectFileShareDto share : loadShares(scope)) {
            if (share.ownerUserId() == ownerId
                    && root.equals(share.root())
                    && share.path().equals(subPath)) {
                return true;
            }
        }
        return false;
    }

    private void pruneShares(ProjectScope scope, String root, String deletedPath) {
        synchronized (shareLock) {
            List<ProjectFileShareDto> shares = loadShares(scope);
            boolean changed = shares.removeIf(item -> item.ownerUserId() == scope.userId()
                    && root.equals(item.root())
                    && (item.path().equals(deletedPath) || item.path().startsWith(deletedPath + "/")));
            if (changed) {
                saveShares(scope, shares);
            }
        }
    }

    private void renameShares(ProjectScope scope, String root, String fromPath, String toPath) {
        if (fromPath.equals(toPath)) {
            return;
        }
        synchronized (shareLock) {
            List<ProjectFileShareDto> shares = loadShares(scope);
            List<ProjectFileShareDto> next = new ArrayList<>(shares.size());
            boolean changed = false;
            for (ProjectFileShareDto item : shares) {
                if (item.ownerUserId() != scope.userId() || !root.equals(item.root())) {
                    next.add(item);
                    continue;
                }
                String path = item.path();
                if (path.equals(fromPath)) {
                    path = toPath;
                } else if (path.startsWith(fromPath + "/")) {
                    path = toPath + path.substring(fromPath.length());
                }
                if (!path.equals(item.path())) {
                    changed = true;
                    next.add(new ProjectFileShareDto(item.ownerUserId(), item.ownerUsername(),
                            item.root(), path, item.sharedAt()));
                } else {
                    next.add(item);
                }
            }
            if (changed) {
                saveShares(scope, next);
            }
        }
    }

    private static boolean isOwn(
                                ProjectFileShareDto item,
                                String root,
                                String path,
                                ProjectScope scope) {
        return item.ownerUserId() == scope.userId()
                && root.equals(item.root())
                && path.equals(item.path());
    }

    private String currentUsername(ProjectScope scope) {
        try {
            Optional<UserEntity> user = userStore.findById(scope.userId());
            if (user != null && user.isPresent() && user.get().getUsername() != null
                    && !user.get().getUsername().isBlank()) {
                return user.get().getUsername();
            }
        } catch (RuntimeException ignored) {
            // 用户目录不可用时退回 id，不影响共享本身。
        }
        return "u" + scope.userId();
    }

    private static String displayName(ProjectFileShareDto share) {
        return share.ownerUsername() == null || share.ownerUsername().isBlank()
                ? "u" + share.ownerUserId()
                : share.ownerUsername();
    }

    private static String lastPathSegment(String path) {
        int slash = path.lastIndexOf('/');
        String leaf = slash < 0 ? path : path.substring(slash + 1);
        return leaf.isBlank() ? "u-shared" : leaf;
    }

    // ------------------------------------------------------------------ 历史迁移

    /**
     * 升级前的项目级 docs/scripts 没有创建者信息。首次访问时一次性把它们归属给初始管理员
     * （admin，其次是 id 最小的注册用户），其它账号不会看到这批历史文件。
     */
    private synchronized void migrateLegacyProjectFiles(
                                                         String tenantId,
                                                         String projectId,
                                                         ProjectEntity project,
                                                         long fallbackUserId) {
        String key = tenantId + ":" + projectId;
        if (migratedLegacyProjects.contains(key)) {
            return;
        }
        Path legacyRoot = configDirectory.resolve(ConfigPaths.tenantProjectDir(tenantId, projectId))
                .toAbsolutePath().normalize();
        String docs = docsDir(project);
        String scripts = scriptsDir(project);
        Path legacyDocs = ConfigPathSandbox.resolveInside(legacyRoot, docs);
        Path legacyScripts = ConfigPathSandbox.resolveInside(legacyRoot, scripts);
        boolean docsHasEntries = hasEntries(legacyDocs);
        boolean scriptsHasEntries = hasEntries(legacyScripts);
        if (docsHasEntries || scriptsHasEntries) {
            long ownerId = resolveLegacyOwnerId(fallbackUserId);
            Path ownerRoot = configDirectory.resolve(
                    ConfigPaths.tenantProjectUserDir(tenantId, projectId, ownerId)).toAbsolutePath().normalize();
            if (docsHasEntries) {
                mergeDirectoryInto(legacyDocs, ConfigPathSandbox.resolveInside(ownerRoot, docs));
            }
            if (scriptsHasEntries) {
                mergeDirectoryInto(legacyScripts, ConfigPathSandbox.resolveInside(ownerRoot, scripts));
            }
        }
        migratedLegacyProjects.add(key);
    }

    private long resolveLegacyOwnerId(long fallbackUserId) {
        try {
            Optional<UserEntity> admin = userStore.findByUsername("admin");
            if (admin != null && admin.isPresent() && admin.get().getId() != null) {
                return admin.get().getId();
            }
            List<UserEntity> registered = userStore.listRegisteredUsers();
            if (registered != null) {
                Long smallest = registered.stream()
                        .filter(Objects::nonNull)
                        .map(UserEntity::getId)
                        .filter(Objects::nonNull)
                        .min(Long::compareTo)
                        .orElse(null);
                if (smallest != null) {
                    return smallest;
                }
            }
        } catch (RuntimeException ignored) {
            // 用户目录不可用时退回当前访问账号，不阻塞文件读写。
        }
        return fallbackUserId;
    }

    private static boolean hasEntries(Path dir) {
        if (dir == null || !Files.isDirectory(dir)) {
            return false;
        }
        try (Stream<Path> entries = Files.list(dir)) {
            return entries.findAny().isPresent();
        } catch (IOException ex) {
            return false;
        }
    }

    private static void mergeDirectoryInto(Path source, Path target) {
        try (Stream<Path> walk = Files.walk(source)) {
            List<Path> paths = walk.filter(path -> !path.equals(source)).sorted().toList();
            for (Path path : paths) {
                Path destination = target.resolve(source.relativize(path).toString());
                if (Files.isDirectory(path)) {
                    Files.createDirectories(destination);
                } else if (!Files.exists(destination)) {
                    Files.createDirectories(destination.getParent());
                    Files.move(path, destination);
                }
            }
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to migrate legacy project files", ex);
        }
    }

    // ------------------------------------------------------------------ 工具

    static String normalizeRoot(String root) {
        if (root == null || root.isBlank()) {
            throw new IllegalArgumentException("root is required (docs|scripts)");
        }
        String normalized = root.trim().toLowerCase(Locale.ROOT);
        if (!ROOT_DOCS.equals(normalized) && !ROOT_SCRIPTS.equals(normalized)) {
            throw new IllegalArgumentException("root must be docs|scripts");
        }
        return normalized;
    }

    private static String normalizeRelative(String path) {
        if (path == null || path.isBlank() || ".".equals(path.trim())) {
            return "";
        }
        String normalized = path.trim().replace('\\', '/');
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        // 共享引用路径用清单里的共享目录做范围校验，`..` 会绕过该范围，必须直接拒绝。
        for (String segment : normalized.split("/")) {
            if ("..".equals(segment)) {
                throw new IllegalArgumentException("PROJECT_PATH_ESCAPE_FORBIDDEN");
            }
        }
        return normalized;
    }

    private static String requireRelativeFile(String path) {
        if (path == null || path.isBlank()) {
            throw new IllegalArgumentException("path is required");
        }
        return normalizeRelative(path);
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

    private static String relativize(Path root, Path target) {
        String rel = root.toAbsolutePath().normalize().relativize(target.toAbsolutePath().normalize())
                .toString()
                .replace('\\', '/');
        return rel.isBlank() ? "" : rel;
    }
}
