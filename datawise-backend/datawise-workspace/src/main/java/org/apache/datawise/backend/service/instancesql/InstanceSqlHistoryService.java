package org.apache.datawise.backend.service.instancesql;

import org.apache.datawise.backend.common.support.PathSegmentSanitizer;
import org.apache.datawise.backend.domain.InstanceSqlHistoryEntryDto;
import org.apache.datawise.backend.domain.ReadInstanceSqlResult;
import org.apache.datawise.backend.service.UserResource;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;

@Service
public class InstanceSqlHistoryService {

    private static final Logger log = LoggerFactory.getLogger(InstanceSqlHistoryService.class);
    private static final int MAX_HISTORY_VERSIONS = 100;

    private final InstanceSqlWorkspaceSupport workspaceSupport;
    private final UserResourcePolicy resourcePolicy;

    public InstanceSqlHistoryService(
            InstanceSqlWorkspaceSupport workspaceSupport,
            UserResourcePolicy resourcePolicy
    ) {
        this.workspaceSupport = workspaceSupport;
        this.resourcePolicy = resourcePolicy;
    }

    public List<InstanceSqlHistoryEntryDto> listSqlHistory(
            String connectionId,
            String instanceName,
            String fileName
    ) throws IOException {
        if (connectionId == null || connectionId.isBlank()) {
            throw new IllegalArgumentException("connectionId is required");
        }
        if (instanceName == null || instanceName.isBlank()) {
            throw new IllegalArgumentException("instanceName is required");
        }
        String safeFileName = PathSegmentSanitizer.sanitizeFileName(fileName, InstanceSqlWorkspaceSupport.DEFAULT_FILE);
        Path workspaceDir = workspaceSupport.resolveWorkspaceDir(connectionId, instanceName.trim());
        Path historyDir = workspaceSupport.resolveHistoryDir(workspaceDir, safeFileName);
        if (!Files.isDirectory(historyDir)) {
            return List.of();
        }

        List<InstanceSqlHistoryEntryDto> entries = new ArrayList<>();
        try (Stream<Path> stream = Files.list(historyDir)) {
            for (Path path : stream
                    .filter(candidate -> Files.isRegularFile(candidate)
                            && candidate.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".sql"))
                    .toList()) {
                String versionId = path.getFileName().toString();
                if (versionId.endsWith(".sql")) {
                    versionId = versionId.substring(0, versionId.length() - 4);
                }
                long savedAt = parseHistoryVersionId(versionId);
                long sizeBytes = Files.size(path);
                entries.add(new InstanceSqlHistoryEntryDto(
                        versionId,
                        savedAt,
                        workspaceSupport.readPreview(path),
                        sizeBytes
                ));
            }
        }
        entries.sort(Comparator.comparingLong(InstanceSqlHistoryEntryDto::savedAt).reversed());
        return entries;
    }

    public ReadInstanceSqlResult readSqlHistoryVersion(
            String connectionId,
            String instanceName,
            String fileName,
            String versionId
    ) throws IOException {
        Path historyFile = resolveHistoryVersionPath(connectionId, instanceName, fileName, versionId);
        String safeFileName = PathSegmentSanitizer.sanitizeFileName(fileName, InstanceSqlWorkspaceSupport.DEFAULT_FILE);
        String sql = Files.readString(historyFile, StandardCharsets.UTF_8);
        return new ReadInstanceSqlResult(sql, safeFileName, workspaceSupport.relativize(historyFile));
    }

    public ReadInstanceSqlResult restoreSqlHistoryVersion(
            String connectionId,
            String instanceName,
            String fileName,
            String versionId
    ) throws IOException {
        requireRegisteredUser();
        if (connectionId == null || connectionId.isBlank()) {
            throw new IllegalArgumentException("connectionId is required");
        }
        if (instanceName == null || instanceName.isBlank()) {
            throw new IllegalArgumentException("instanceName is required");
        }
        String instanceKey = instanceName.trim();
        String safeFileName = PathSegmentSanitizer.sanitizeFileName(fileName, InstanceSqlWorkspaceSupport.DEFAULT_FILE);
        Path workspaceDir = workspaceSupport.resolveWorkspaceDir(connectionId, instanceKey);
        Path target = workspaceDir.resolve(safeFileName).normalize();
        if (!target.startsWith(workspaceDir)) {
            throw new IllegalArgumentException("Invalid file name");
        }

        Path historyFile = resolveHistoryVersionPath(connectionId, instanceKey, safeFileName, versionId);
        String restoredSql = Files.readString(historyFile, StandardCharsets.UTF_8);
        archiveSqlVersionIfChanged(workspaceDir, target, safeFileName, restoredSql);
        Files.writeString(target, restoredSql, StandardCharsets.UTF_8);
        log.info(
                "InstanceSqlHistoryService.restoreSqlHistoryVersion connectionId={} instance={} file={} version={}",
                connectionId,
                instanceKey,
                safeFileName,
                versionId
        );
        return new ReadInstanceSqlResult(restoredSql, safeFileName, workspaceSupport.relativize(target));
    }

    void archiveSqlVersionIfChanged(
            Path workspaceDir,
            Path target,
            String fileName,
            String newSql
    ) throws IOException {
        if (!Files.isRegularFile(target)) {
            return;
        }
        String current = Files.readString(target, StandardCharsets.UTF_8);
        String normalizedNew = newSql != null ? newSql : "";
        if (current.equals(normalizedNew)) {
            return;
        }

        Path historyDir = workspaceSupport.resolveHistoryDir(workspaceDir, fileName);
        Files.createDirectories(historyDir);
        String versionId = String.valueOf(System.currentTimeMillis());
        Path historyFile = historyDir.resolve(versionId + ".sql");
        Files.writeString(historyFile, current, StandardCharsets.UTF_8);
        pruneHistory(historyDir);
    }

    void moveHistoryDirOnRename(Path workspaceDir, String oldName, String newName) throws IOException {
        Path oldHistoryDir = workspaceSupport.resolveHistoryDir(workspaceDir, oldName);
        if (!Files.isDirectory(oldHistoryDir)) {
            return;
        }
        Path newHistoryDir = workspaceSupport.resolveHistoryDir(workspaceDir, newName);
        Files.createDirectories(workspaceDir.resolve(InstanceSqlWorkspaceSupport.HISTORY_ROOT));
        if (Files.exists(newHistoryDir)) {
            deleteHistoryDirectory(newHistoryDir);
        }
        Files.move(oldHistoryDir, newHistoryDir);
    }

    void deleteHistoryForFile(Path workspaceDir, String fileName) throws IOException {
        Path historyDir = workspaceSupport.resolveHistoryDir(workspaceDir, fileName);
        if (Files.isDirectory(historyDir)) {
            deleteHistoryDirectory(historyDir);
        }
    }

    private Path resolveHistoryVersionPath(
            String connectionId,
            String instanceName,
            String fileName,
            String versionId
    ) throws IOException {
        if (versionId == null || versionId.isBlank()) {
            throw new IllegalArgumentException("versionId is required");
        }
        String safeFileName = PathSegmentSanitizer.sanitizeFileName(fileName, InstanceSqlWorkspaceSupport.DEFAULT_FILE);
        Path workspaceDir = workspaceSupport.resolveWorkspaceDir(connectionId, instanceName.trim());
        Path historyDir = workspaceSupport.resolveHistoryDir(workspaceDir, safeFileName);
        String safeVersionId = PathSegmentSanitizer.sanitize(versionId.trim(), "version");
        Path historyFile = historyDir.resolve(safeVersionId + ".sql").normalize();
        if (!historyFile.startsWith(historyDir) || !Files.isRegularFile(historyFile)) {
            throw new IllegalArgumentException("History version not found: " + versionId);
        }
        return historyFile;
    }

    private void pruneHistory(Path historyDir) throws IOException {
        List<Path> versions = new ArrayList<>();
        try (Stream<Path> stream = Files.list(historyDir)) {
            stream.filter(path -> Files.isRegularFile(path)
                            && path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".sql"))
                    .forEach(versions::add);
        }
        if (versions.size() <= MAX_HISTORY_VERSIONS) {
            return;
        }
        versions.sort(Comparator.comparing(workspaceSupport::lastModifiedTime));
        int removeCount = versions.size() - MAX_HISTORY_VERSIONS;
        for (int i = 0; i < removeCount; i++) {
            Files.deleteIfExists(versions.get(i));
        }
    }

    private void deleteHistoryDirectory(Path historyDir) throws IOException {
        try (Stream<Path> walk = Files.walk(historyDir)) {
            List<Path> paths = walk.sorted(Comparator.reverseOrder()).toList();
            for (Path path : paths) {
                Files.deleteIfExists(path);
            }
        }
    }

    private void requireRegisteredUser() {
        if (resourcePolicy != null) {
            resourcePolicy.requireWrite(UserResource.WORKSPACE_SCRIPTS);
        }
    }

    private static long parseHistoryVersionId(String versionId) {
        try {
            return Long.parseLong(versionId);
        } catch (NumberFormatException ex) {
            return 0L;
        }
    }
}
