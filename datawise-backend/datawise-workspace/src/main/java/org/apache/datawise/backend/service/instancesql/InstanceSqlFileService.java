package org.apache.datawise.backend.service.instancesql;

import org.apache.datawise.backend.common.support.PathSegmentSanitizer;
import org.apache.datawise.backend.domain.ReadInstanceSqlResult;
import org.apache.datawise.backend.domain.RenameInstanceSqlRequest;
import org.apache.datawise.backend.domain.SaveInstanceSqlRequest;
import org.apache.datawise.backend.domain.SaveInstanceSqlResult;
import org.apache.datawise.backend.service.UserResource;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.Locale;
import java.util.Optional;
import java.util.stream.Stream;

@Service
public class InstanceSqlFileService {

    private static final Logger log = LoggerFactory.getLogger(InstanceSqlFileService.class);

    private final InstanceSqlWorkspaceSupport workspaceSupport;
    private final InstanceSqlHistoryService historyService;
    private final UserResourcePolicy resourcePolicy;

    public InstanceSqlFileService(
            InstanceSqlWorkspaceSupport workspaceSupport,
            InstanceSqlHistoryService historyService,
            UserResourcePolicy resourcePolicy
    ) {
        this.workspaceSupport = workspaceSupport;
        this.historyService = historyService;
        this.resourcePolicy = resourcePolicy;
    }

    public SaveInstanceSqlResult saveSql(SaveInstanceSqlRequest request) throws IOException {
        requireRegisteredUser();
        if (request.connectionId() == null || request.connectionId().isBlank()) {
            throw new IllegalArgumentException("connectionId is required");
        }
        String instanceKey = resolveInstanceKey(request);
        if (instanceKey.isBlank()) {
            throw new IllegalArgumentException("instanceId or instanceName is required");
        }

        Path workspaceDir = workspaceSupport.resolveWorkspaceDir(request.connectionId(), instanceKey);
        Files.createDirectories(workspaceDir);

        String fileName = PathSegmentSanitizer.sanitizeFileName(
                request.fileName(),
                InstanceSqlWorkspaceSupport.DEFAULT_FILE
        );
        Path target = workspaceDir.resolve(fileName).normalize();
        if (!target.startsWith(workspaceDir)) {
            throw new IllegalArgumentException("Invalid file name");
        }

        historyService.archiveSqlVersionIfChanged(workspaceDir, target, fileName, request.sql());

        Files.writeString(target, request.sql() != null ? request.sql() : "", StandardCharsets.UTF_8);

        String relative = workspaceSupport.relativize(target);
        String directory = workspaceSupport.relativize(workspaceDir);
        log.info("InstanceSqlFileService.saveSql connectionId={} instance={} file={} path={}",
                request.connectionId(),
                instanceKey,
                fileName,
                relative);
        return new SaveInstanceSqlResult(relative, fileName, directory);
    }

    public SaveInstanceSqlResult renameSqlFile(RenameInstanceSqlRequest request) throws IOException {
        requireRegisteredUser();
        if (request.connectionId() == null || request.connectionId().isBlank()) {
            throw new IllegalArgumentException("connectionId is required");
        }
        if (request.instanceName() == null || request.instanceName().isBlank()) {
            throw new IllegalArgumentException("instanceName is required");
        }

        String instanceKey = request.instanceName().trim();
        String oldName = PathSegmentSanitizer.sanitizeFileName(request.oldFileName(), InstanceSqlWorkspaceSupport.DEFAULT_FILE);
        String newName = PathSegmentSanitizer.requireSqlFileName(request.newFileName());

        Path workspaceDir = workspaceSupport.resolveWorkspaceDir(request.connectionId(), instanceKey);
        Path source = workspaceDir.resolve(oldName).normalize();
        Path target = workspaceDir.resolve(newName).normalize();
        if (!source.startsWith(workspaceDir) || !target.startsWith(workspaceDir)) {
            throw new IllegalArgumentException("Invalid file name");
        }

        if (oldName.equalsIgnoreCase(newName)) {
            String relative = Files.exists(source) ? workspaceSupport.relativize(source) : "";
            String directory = workspaceSupport.relativize(workspaceDir);
            return new SaveInstanceSqlResult(relative, newName, directory);
        }

        if (!Files.isRegularFile(source)) {
            throw new IllegalArgumentException("SQL file not found: " + oldName);
        }
        if (Files.exists(target)) {
            throw new IllegalArgumentException("Target file already exists: " + newName);
        }

        Files.move(source, target);
        historyService.moveHistoryDirOnRename(workspaceDir, oldName, newName);
        String relative = workspaceSupport.relativize(target);
        String directory = workspaceSupport.relativize(workspaceDir);
        log.info("InstanceSqlFileService.renameSqlFile connectionId={} instance={} {} -> {}",
                request.connectionId(),
                instanceKey,
                oldName,
                newName);
        return new SaveInstanceSqlResult(relative, newName, directory);
    }

    public void deleteSqlFile(String connectionId, String instanceName, String fileName) throws IOException {
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
        if (!Files.isRegularFile(target)) {
            throw new IllegalArgumentException("SQL file not found: " + safeFileName);
        }

        Files.delete(target);
        historyService.deleteHistoryForFile(workspaceDir, safeFileName);
        log.info("InstanceSqlFileService.deleteSqlFile connectionId={} instance={} file={}",
                connectionId,
                instanceKey,
                safeFileName);
    }

    public ReadInstanceSqlResult readSqlFile(String connectionId, String instanceName, String fileName)
            throws IOException {
        if (connectionId == null || connectionId.isBlank()) {
            throw new IllegalArgumentException("connectionId is required");
        }
        if (instanceName == null || instanceName.isBlank()) {
            throw new IllegalArgumentException("instanceName is required");
        }

        String safeFileName = PathSegmentSanitizer.sanitizeFileName(fileName, InstanceSqlWorkspaceSupport.DEFAULT_FILE);
        Path workspaceDir = workspaceSupport.resolveWorkspaceDir(connectionId, instanceName);
        Path target = workspaceDir.resolve(safeFileName).normalize();
        if (!target.startsWith(workspaceDir)) {
            throw new IllegalArgumentException("Invalid file name");
        }

        String sql = Files.exists(target) ? Files.readString(target, StandardCharsets.UTF_8) : "";
        String relative = Files.exists(target) ? workspaceSupport.relativize(target) : "";
        return new ReadInstanceSqlResult(sql, safeFileName, relative);
    }

    public ReadInstanceSqlResult readLatestSqlFile(String connectionId, String instanceName) throws IOException {
        if (connectionId == null || connectionId.isBlank()) {
            throw new IllegalArgumentException("connectionId is required");
        }
        if (instanceName == null || instanceName.isBlank()) {
            throw new IllegalArgumentException("instanceName is required");
        }

        Path workspaceDir = workspaceSupport.resolveWorkspaceDir(connectionId, instanceName);
        if (!Files.isDirectory(workspaceDir)) {
            return emptyReadResult();
        }

        Optional<Path> latestPath;
        try (Stream<Path> stream = Files.list(workspaceDir)) {
            latestPath = stream
                    .filter(path -> Files.isRegularFile(path)
                            && path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".sql"))
                    .max(Comparator.comparing(workspaceSupport::lastModifiedTime));
        }

        if (latestPath.isEmpty()) {
            return emptyReadResult();
        }

        Path target = latestPath.get().normalize();
        if (!target.startsWith(workspaceDir)) {
            throw new IllegalArgumentException("Invalid file path");
        }

        String fileName = target.getFileName().toString();
        String sql = Files.readString(target, StandardCharsets.UTF_8);
        return new ReadInstanceSqlResult(sql, fileName, workspaceSupport.relativize(target));
    }

    public String readSql(String connectionId, String instanceName, String fileName) throws IOException {
        return readSqlFile(connectionId, instanceName, fileName).sql();
    }

    private ReadInstanceSqlResult emptyReadResult() {
        return new ReadInstanceSqlResult("", InstanceSqlWorkspaceSupport.DEFAULT_FILE, "");
    }

    private String resolveInstanceKey(SaveInstanceSqlRequest request) {
        if (request.instanceName() != null && !request.instanceName().isBlank()) {
            return request.instanceName().trim();
        }
        if (request.instanceId() != null && !request.instanceId().isBlank()) {
            return request.instanceId().trim();
        }
        return "";
    }

    private void requireRegisteredUser() {
        if (resourcePolicy != null) {
            resourcePolicy.requireWrite(UserResource.WORKSPACE_SCRIPTS);
        }
    }
}
