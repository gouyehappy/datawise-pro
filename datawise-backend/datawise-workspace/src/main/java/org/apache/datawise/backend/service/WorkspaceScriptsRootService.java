package org.apache.datawise.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.config.DatawiseWorkspaceProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.WorkspaceSettingsStore;
import org.apache.datawise.backend.domain.UpdateWorkspaceSettingsRequest;
import org.apache.datawise.backend.domain.WorkspaceSettingsDto;
import org.apache.datawise.backend.common.support.XmlConfigSupport;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

@Service
public class WorkspaceScriptsRootService {

    private static final Logger logger = LoggerFactory.getLogger(WorkspaceScriptsRootService.class);

    private static final String LEGACY_SETTINGS_FILE = "data/workspace-settings.json";

    private final ObjectMapper objectMapper;
    private final ConfigDirectoryService configDirectory;
    private final WorkspaceSettingsStore workspaceSettingsStore;
    private final String defaultScriptsDir;
    private final boolean persistChanges;
    private volatile String configuredScriptsDir;
    private volatile Path root;

    @Autowired
    public WorkspaceScriptsRootService(
            ObjectMapper objectMapper,
            DatawiseWorkspaceProperties workspaceProperties,
            ConfigDirectoryService configDirectory,
            WorkspaceSettingsStore workspaceSettingsStore
    ) {
        this.objectMapper = objectMapper;
        this.configDirectory = configDirectory;
        this.workspaceSettingsStore = workspaceSettingsStore;
        this.defaultScriptsDir = workspaceProperties.getScriptsDir();
        this.persistChanges = true;
        migrateLegacySettingsIfNeeded();
        reloadFromDisk();
    }

    /**
     * 测试注入固定根目录
     */
    WorkspaceScriptsRootService(Path scriptsRoot) {
        this(scriptsRoot, false);
    }

    /**
     * 测试注入：{@code asConfigRoot=true} 时 {@code baseDir} 为配置根，相对路径在其下解析。
     */
    WorkspaceScriptsRootService(Path baseDir, boolean asConfigRoot) {
        this.objectMapper = new ObjectMapper();
        this.defaultScriptsDir = "scripts";
        this.persistChanges = false;
        if (asConfigRoot) {
            this.configDirectory = new ConfigDirectoryService(baseDir);
            this.workspaceSettingsStore = new WorkspaceSettingsStore(configDirectory);
            reloadFromDisk();
            return;
        }
        this.configDirectory = new ConfigDirectoryService(baseDir.getParent() != null
                ? baseDir.getParent()
                : baseDir);
        this.workspaceSettingsStore = new WorkspaceSettingsStore(configDirectory);
        this.configuredScriptsDir = baseDir.getFileName() != null
                ? baseDir.getFileName().toString()
                : "scripts";
        this.root = baseDir.toAbsolutePath().normalize();
    }

    public String scriptsRoot() {
        return getRoot().toString();
    }

    public Path getRoot() {
        if (persistChanges) {
            reloadFromDisk();
        }
        return root;
    }

    public WorkspaceSettingsDto getSettings() {
        if (persistChanges) {
            reloadFromDisk();
        }
        return new WorkspaceSettingsDto(configuredScriptsDir, root.toString());
    }

    public synchronized WorkspaceSettingsDto updateSettings(UpdateWorkspaceSettingsRequest request) throws IOException {
        if (request == null || request.scriptsDir() == null || request.scriptsDir().isBlank()) {
            throw new IllegalArgumentException("scriptsDir is required");
        }
        String nextConfigured = request.scriptsDir().trim();
        Path nextRoot = resolveScriptsRoot(nextConfigured);
        Files.createDirectories(nextRoot);
        configuredScriptsDir = toPersistableScriptsDir(nextRoot);
        root = nextRoot;
        if (persistChanges) {
            workspaceSettingsStore.writeScriptsDir(configuredScriptsDir);
        }
        return getSettings();
    }

    private void reloadFromDisk() {
        configuredScriptsDir = workspaceSettingsStore.readScriptsDir(defaultScriptsDir);
        root = resolveScriptsRoot(configuredScriptsDir);
        String persistable = toPersistableScriptsDir(root);
        if (!persistable.equals(configuredScriptsDir)) {
            configuredScriptsDir = persistable;
            if (persistChanges) {
                try {
                    workspaceSettingsStore.writeScriptsDir(persistable);
                } catch (IOException ex) {
                    ExceptionLogging.recoverable(logger, "Failed to normalize scripts-dir under workspace root", ex);
                }
            }
        }
    }

    private void migrateLegacySettingsIfNeeded() {
        if (XmlConfigSupport.isRegularFile(configDirectory.resolve("workspace.xml"))) {
            return;
        }
        Path legacyPath = Paths.get(LEGACY_SETTINGS_FILE);
        if (!XmlConfigSupport.isRegularFile(legacyPath)) {
            return;
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> payload = objectMapper.readValue(legacyPath.toFile(), Map.class);
            Object value = payload.get("scriptsDir");
            if (!(value instanceof String text) || text.isBlank()) {
                return;
            }
            updateSettings(new UpdateWorkspaceSettingsRequest(text.trim()));
        } catch (Exception ex) {
            ExceptionLogging.recoverable(logger, "Legacy workspace settings migration skipped", ex);
        }
    }

    private Path resolveScriptsRoot(String configured) {
        if (configured == null || configured.isBlank()) {
            throw new IllegalArgumentException("scriptsDir is required");
        }
        String trimmed = configured.trim();
        if (trimmed.indexOf('\0') >= 0) {
            throw new IllegalArgumentException("scriptsDir contains invalid characters");
        }
        Path configRoot = configDirectory.getRoot().toAbsolutePath().normalize();
        Path path = Paths.get(trimmed);
        if (path.isAbsolute()) {
            Path absolute = path.toAbsolutePath().normalize();
            // Workspace is the root: scripts must live under it. Legacy absolute paths
            // outside the workspace are remapped to {workspace}/scripts.
            if (!absolute.startsWith(configRoot)) {
                return configRoot.resolve("scripts").normalize();
            }
            return absolute;
        }
        for (Path segment : path) {
            if ("..".equals(segment.toString())) {
                throw new IllegalArgumentException("scriptsDir must stay under the workspace directory");
            }
        }
        Path resolved = configRoot.resolve(path).normalize();
        if (!resolved.startsWith(configRoot)) {
            throw new IllegalArgumentException("scriptsDir must stay under the workspace directory");
        }
        return resolved;
    }

    /** Persist relative path under the workspace root (never an absolute escape). */
    private String toPersistableScriptsDir(Path resolved) {
        Path configRoot = configDirectory.getRoot().toAbsolutePath().normalize();
        Path normalized = resolved.toAbsolutePath().normalize();
        if (!normalized.startsWith(configRoot)) {
            return "scripts";
        }
        String relative = configRoot.relativize(normalized).toString().replace('\\', '/');
        return relative.isBlank() ? "scripts" : relative;
    }
}
