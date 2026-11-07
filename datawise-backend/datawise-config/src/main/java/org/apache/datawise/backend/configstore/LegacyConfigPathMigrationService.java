package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.domain.LegacyConfigMigrationItemDto;
import org.apache.datawise.backend.domain.LegacyConfigMigrationStatusDto;
import org.apache.datawise.backend.domain.TenantIds;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

/**
 * Scans and applies deprecated root / user-level config paths into tenant-scoped layouts.
 * Uses the same copy + {@code *.migrated} rename as {@link TenantScopedConfigSupport}.
 */
@Service
public class LegacyConfigPathMigrationService {

    private static final String[] TENANT_ROOT_FILES = {
            ConfigPaths.CONNECTIONS,
            ConfigPaths.TEAMS,
            ConfigPaths.OIDC,
            ConfigPaths.SQL_SNIPPETS_SHARED,
    };

    private static final String[] USER_TENANT_FILES = {
            ConfigPaths.SQL_SNIPPETS_PERSONAL,
            ConfigPaths.AI_KNOWLEDGE,
            "analysis-canvas.json",
            "semantic-metrics.json",
            "federated-views.json",
            "schema-drift-monitors.json",
            "scheduled-tasks.json",
            "ai-table-tags.json",
            "query-library-versions.json",
    };

    private static final String[] USER_SCOPE_DIRS = {
            "table-data-audit",
            "ssh-script-records",
    };

    private final ConfigDirectoryService configDirectory;

    public LegacyConfigPathMigrationService(ConfigDirectoryService configDirectory) {
        this.configDirectory = configDirectory;
    }

    public LegacyConfigMigrationStatusDto scan() {
        return LegacyConfigMigrationStatusDto.ofPending(collectPending());
    }

    public LegacyConfigMigrationStatusDto apply() {
        List<LegacyConfigMigrationItemDto> pending = collectPending();
        List<LegacyConfigMigrationItemDto> migrated = new ArrayList<>();
        for (LegacyConfigMigrationItemDto item : pending) {
            Path legacy = configDirectory.resolve(item.legacyRelativePath());
            Path target = configDirectory.resolve(item.targetRelativePath());
            TenantScopedConfigSupport.migrateLegacyIfNeeded(legacy, target);
            if (Files.isRegularFile(target) && !Files.isRegularFile(legacy)) {
                migrated.add(item);
            } else if (Files.isRegularFile(target) && Files.isRegularFile(legacy.resolveSibling(
                    legacy.getFileName() + ".migrated"))) {
                migrated.add(item);
            } else if (Files.isRegularFile(target)) {
                // Target already existed; still count as resolved for this apply pass.
                migrated.add(item);
            }
        }
        List<LegacyConfigMigrationItemDto> stillPending = collectPending();
        return new LegacyConfigMigrationStatusDto(stillPending.size(), stillPending, List.copyOf(migrated));
    }

    private List<LegacyConfigMigrationItemDto> collectPending() {
        List<LegacyConfigMigrationItemDto> pending = new ArrayList<>();
        String tenantId = TenantIds.DEFAULT;
        collectTenantRoot(pending, tenantId);
        collectUserScoped(pending, tenantId);
        pending.sort(Comparator.comparing(LegacyConfigMigrationItemDto::legacyRelativePath));
        return pending;
    }

    private void collectTenantRoot(List<LegacyConfigMigrationItemDto> pending, String tenantId) {
        for (String legacyName : TENANT_ROOT_FILES) {
            String targetRel = switch (legacyName) {
                case ConfigPaths.CONNECTIONS -> ConfigPaths.tenantConnections(tenantId);
                case ConfigPaths.TEAMS -> ConfigPaths.tenantTeams(tenantId);
                case ConfigPaths.OIDC -> ConfigPaths.tenantOidc(tenantId);
                case ConfigPaths.SQL_SNIPPETS_SHARED -> ConfigPaths.tenantSqlSnippetsShared(tenantId);
                default -> null;
            };
            if (targetRel == null) {
                continue;
            }
            addIfPending(pending, legacyName, targetRel, "tenant-root");
        }
    }

    private void collectUserScoped(List<LegacyConfigMigrationItemDto> pending, String tenantId) {
        Path usersRoot = configDirectory.resolve(ConfigPaths.USERS_DIR);
        if (!Files.isDirectory(usersRoot)) {
            return;
        }
        try (DirectoryStream<Path> users = Files.newDirectoryStream(usersRoot)) {
            for (Path userDir : users) {
                if (!Files.isDirectory(userDir)) {
                    continue;
                }
                String dirName = userDir.getFileName().toString();
                long userId;
                try {
                    userId = Long.parseLong(dirName);
                } catch (NumberFormatException ex) {
                    continue;
                }
                for (String fileName : USER_TENANT_FILES) {
                    String legacyRel = ConfigPaths.userDir(userId) + "/" + fileName;
                    String targetRel = ConfigPaths.userTenantFile(userId, tenantId, fileName);
                    addIfPending(pending, legacyRel, targetRel, "user-file");
                }
                for (String scopeDir : USER_SCOPE_DIRS) {
                    Path legacyDir = userDir.resolve(scopeDir);
                    if (!Files.isDirectory(legacyDir)) {
                        continue;
                    }
                    try (Stream<Path> files = Files.list(legacyDir)) {
                        files.filter(Files::isRegularFile)
                                .filter(path -> path.getFileName().toString().endsWith(".json"))
                                .forEach(path -> {
                                    String scopeKey = stripJsonSuffix(path.getFileName().toString());
                                    String legacyRel = ConfigPaths.userDir(userId) + "/" + scopeDir + "/"
                                            + path.getFileName();
                                    String targetRel = ConfigPaths.userTenantScopeFile(
                                            userId, tenantId, scopeDir, scopeKey);
                                    addIfPending(pending, legacyRel, targetRel, "user-scope");
                                });
                    }
                }
            }
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to scan users/ for legacy config paths", ex);
        }
    }

    private void addIfPending(
                              List<LegacyConfigMigrationItemDto> pending,
                              String legacyRel,
                              String targetRel,
                              String kind) {
        Path legacy = configDirectory.resolve(legacyRel);
        Path target = configDirectory.resolve(targetRel);
        if (Files.isRegularFile(legacy) && !Files.isRegularFile(target)) {
            pending.add(new LegacyConfigMigrationItemDto(legacyRel, targetRel, kind));
        }
    }

    private static String stripJsonSuffix(String fileName) {
        if (fileName != null && fileName.toLowerCase().endsWith(".json")) {
            return fileName.substring(0, fileName.length() - 5);
        }
        return fileName;
    }
}
