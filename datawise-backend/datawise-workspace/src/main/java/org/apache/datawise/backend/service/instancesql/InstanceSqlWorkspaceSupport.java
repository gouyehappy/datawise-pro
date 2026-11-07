package org.apache.datawise.backend.service.instancesql;

import org.apache.datawise.backend.common.support.PathSegmentSanitizer;
import org.apache.datawise.backend.service.WorkspaceScriptsRootService;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;

/** Shared path resolution and file helpers for per-instance SQL workspaces. */
@Service
public final class InstanceSqlWorkspaceSupport {

    static final String DEFAULT_FILE = "console.sql";
    static final String HISTORY_ROOT = ".history";

    private final WorkspaceScriptsRootService scriptsRootService;

    public InstanceSqlWorkspaceSupport(WorkspaceScriptsRootService scriptsRootService) {
        this.scriptsRootService = scriptsRootService;
    }

    public Path baseDir() {
        return scriptsRootService.getRoot();
    }

    public Path resolveWorkspaceDir(String connectionId, String instanceKey) {
        String connectionKey = PathSegmentSanitizer.sanitize(connectionId, "connection");
        String instanceSegment = PathSegmentSanitizer.sanitize(instanceKey, "instance");
        Path workspaceDir = baseDir()
                .resolve(connectionKey)
                .resolve(instanceSegment)
                .normalize();
        if (!workspaceDir.startsWith(baseDir())) {
            throw new IllegalArgumentException("Invalid workspace path");
        }
        return workspaceDir;
    }

    public Path resolveHistoryDir(Path workspaceDir, String fileName) {
        String safeFileName = PathSegmentSanitizer.sanitizeFileName(fileName, DEFAULT_FILE);
        Path historyDir = workspaceDir
                .resolve(HISTORY_ROOT)
                .resolve(safeFileName)
                .normalize();
        if (!historyDir.startsWith(workspaceDir)) {
            throw new IllegalArgumentException("Invalid history path");
        }
        return historyDir;
    }

    public String relativize(Path path) {
        return baseDir().relativize(path).toString().replace('\\', '/');
    }

    public String readPreview(Path path) throws IOException {
        String content = Files.readString(path, StandardCharsets.UTF_8).trim();
        if (content.isEmpty()) {
            return "<empty>";
        }
        String firstLine = content.lines().findFirst().orElse(content);
        if (firstLine.length() > 80) {
            return firstLine.substring(0, 77) + "...";
        }
        return firstLine;
    }

    public FileTime lastModifiedTime(Path path) {
        try {
            return Files.getLastModifiedTime(path);
        } catch (IOException ex) {
            return FileTime.fromMillis(0L);
        }
    }
}
