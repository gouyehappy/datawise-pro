package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.security.UserContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/**
 * 租户作用域配置路径：读写 {@code tenants/{id}/…}；仅 default 从根目录 legacy 迁移。
 */
public final class TenantScopedConfigSupport {

    private static final Logger log = LoggerFactory.getLogger(TenantScopedConfigSupport.class);

    private TenantScopedConfigSupport() {
    }

    public static String currentTenantId() {
        return TenantIds.normalizeOrDefault(UserContext.getTenantId());
    }

    public static String teamsPath(String tenantId) {
        return ConfigPaths.tenantTeams(TenantIds.normalizeOrDefault(tenantId));
    }

    public static String connectionsPath(String tenantId) {
        return ConfigPaths.tenantConnections(TenantIds.normalizeOrDefault(tenantId));
    }

    public static String oidcPath(String tenantId) {
        return ConfigPaths.tenantOidc(TenantIds.normalizeOrDefault(tenantId));
    }

    /**
     * 解析当前（或指定）租户的相对路径；仅 default 租户会从根目录 legacy 迁移。
     */
    public static String ensureTenantRelativePath(
                                                  ConfigDirectoryService configDirectory,
                                                  String tenantRelativePath,
                                                  String legacyRelativePath) {
        return ensureTenantRelativePath(
                configDirectory,
                TenantIds.DEFAULT,
                tenantRelativePath,
                legacyRelativePath);
    }

    public static String ensureTenantRelativePath(
                                                  ConfigDirectoryService configDirectory,
                                                  String tenantId,
                                                  String tenantRelativePath,
                                                  String legacyRelativePath) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        Path tenantPath = configDirectory.resolve(tenantRelativePath);
        if (TenantIds.DEFAULT.equals(id) && legacyRelativePath != null && !legacyRelativePath.isBlank()) {
            Path legacyPath = configDirectory.resolve(legacyRelativePath);
            migrateLegacyIfNeeded(legacyPath, tenantPath);
        } else {
            try {
                Files.createDirectories(tenantPath.getParent());
            } catch (IOException ex) {
                throw new IllegalStateException("Failed to create tenant config dir for " + tenantRelativePath, ex);
            }
        }
        return tenantRelativePath;
    }

    /** 当前租户 teams.json（default 可迁根目录 teams.json）。 */
    public static String ensureCurrentTeamsPath(ConfigDirectoryService configDirectory) {
        String tenantId = currentTenantId();
        return ensureTenantRelativePath(
                configDirectory,
                tenantId,
                teamsPath(tenantId),
                TenantIds.DEFAULT.equals(tenantId) ? ConfigPaths.TEAMS : null);
    }

    public static String ensureCurrentConnectionsPath(ConfigDirectoryService configDirectory) {
        String tenantId = currentTenantId();
        return ensureTenantRelativePath(
                configDirectory,
                tenantId,
                connectionsPath(tenantId),
                TenantIds.DEFAULT.equals(tenantId) ? ConfigPaths.CONNECTIONS : null);
    }

    public static String ensureCurrentOidcPath(ConfigDirectoryService configDirectory) {
        String tenantId = currentTenantId();
        return ensureTenantRelativePath(
                configDirectory,
                tenantId,
                oidcPath(tenantId),
                TenantIds.DEFAULT.equals(tenantId) ? ConfigPaths.OIDC : null);
    }

    public static String ensureTeamsPath(ConfigDirectoryService configDirectory, String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        return ensureTenantRelativePath(
                configDirectory,
                id,
                teamsPath(id),
                TenantIds.DEFAULT.equals(id) ? ConfigPaths.TEAMS : null);
    }

    public static String ensureConnectionsPath(ConfigDirectoryService configDirectory, String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        return ensureTenantRelativePath(
                configDirectory,
                id,
                connectionsPath(id),
                TenantIds.DEFAULT.equals(id) ? ConfigPaths.CONNECTIONS : null);
    }

    public static String ensureOidcPath(ConfigDirectoryService configDirectory, String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        return ensureTenantRelativePath(
                configDirectory,
                id,
                oidcPath(id),
                TenantIds.DEFAULT.equals(id) ? ConfigPaths.OIDC : null);
    }

    public static void migrateLegacyIfNeeded(Path legacyPath, Path tenantPath) {
        try {
            if (Files.isRegularFile(tenantPath)) {
                return;
            }
            if (!Files.isRegularFile(legacyPath)) {
                return;
            }
            Files.createDirectories(tenantPath.getParent());
            Files.copy(legacyPath, tenantPath, StandardCopyOption.COPY_ATTRIBUTES);
            Path backup = legacyPath.resolveSibling(legacyPath.getFileName() + ".migrated");
            if (!Files.exists(backup)) {
                try {
                    Files.move(legacyPath, backup, StandardCopyOption.ATOMIC_MOVE);
                } catch (IOException moveEx) {
                    Files.move(legacyPath, backup, StandardCopyOption.REPLACE_EXISTING);
                }
            }
            log.info("Migrated config {} -> {}", legacyPath.getFileName(), tenantPath);
        } catch (IOException ex) {
            throw new IllegalStateException(
                    "Failed to migrate config from " + legacyPath + " to " + tenantPath,
                    ex);
        }
    }

    public static String defaultTenantTeamsPath() {
        return ConfigPaths.tenantTeams(TenantIds.DEFAULT);
    }

    public static String defaultTenantConnectionsPath() {
        return ConfigPaths.tenantConnections(TenantIds.DEFAULT);
    }

    public static String defaultTenantOidcPath() {
        return ConfigPaths.tenantOidc(TenantIds.DEFAULT);
    }

    /**
     * 用户 × 当前租户工作区文件：路径 {@code users/{id}/tenants/{tenantId}/{fileName}}。
     * 仅 default 租户会从 {@code users/{id}/{fileName}} legacy 迁移。
     */
    public static String ensureUserTenantFile(
                                              ConfigDirectoryService configDirectory,
                                              long userId,
                                              String fileName) {
        String tenantId = currentTenantId();
        String tenantRel = ConfigPaths.userTenantFile(userId, tenantId, fileName);
        String legacyRel = ConfigPaths.userDir(userId) + "/" + fileName;
        return ensureTenantRelativePath(
                configDirectory,
                tenantId,
                tenantRel,
                TenantIds.DEFAULT.equals(tenantId) ? legacyRel : null);
    }

    /** 用户 × 当前租户 × scope 文件（如 table-data-audit / ssh-script-records）。 */
    public static String ensureUserTenantScopeFile(
                                                   ConfigDirectoryService configDirectory,
                                                   long userId,
                                                   String dirName,
                                                   String scopeKey) {
        String tenantId = currentTenantId();
        String tenantRel = ConfigPaths.userTenantScopeFile(userId, tenantId, dirName, scopeKey);
        String legacyRel = ConfigPaths.userDir(userId) + "/" + dirName + "/"
                + (scopeKey == null || scopeKey.isBlank() ? "default" : scopeKey.replaceAll("[^a-zA-Z0-9._-]", "_"))
                + ".json";
        return ensureTenantRelativePath(
                configDirectory,
                tenantId,
                tenantRel,
                TenantIds.DEFAULT.equals(tenantId) ? legacyRel : null);
    }

    public static String ensureCurrentSharedSqlSnippetsPath(ConfigDirectoryService configDirectory) {
        String tenantId = currentTenantId();
        return ensureTenantRelativePath(
                configDirectory,
                tenantId,
                ConfigPaths.tenantSqlSnippetsShared(tenantId),
                TenantIds.DEFAULT.equals(tenantId) ? ConfigPaths.SQL_SNIPPETS_SHARED : null);
    }

    public static String cacheKey(long userId) {
        return userId + ":" + currentTenantId();
    }
}
