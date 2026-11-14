package org.apache.datawise.backend.service;

import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.security.ApiTokenFeatureScopes;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.stereotype.Service;

import java.util.regex.Pattern;
import java.util.Locale;
import java.util.Set;

import org.apache.datawise.backend.domain.TreeNode;

/**
 * 当前会话用户的功能权限校验（API 层防绕过 UI/快捷键）。
 * API Token：{@link ApiTokenFeatureScopes} 映射 ∩ 绑定用户 RBAC（取交集，禁止 scope 单独提权）。
 */
@Service
public class FeaturePermissionAccess {

    private static final String API_TOKEN_PERMISSION_DENIED = "API token missing required scope for this feature";

    private static final Set<String> SCHEMA_CATALOG_FOLDER_LABELS = Set.of(
            "tables",
            "views",
            "functions",
            "procedures",
            "triggers");

    private static final Pattern SQL_WRITE = Pattern.compile(
            "\\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|MERGE|GRANT|REVOKE|CALL|EXEC|BEGIN|COMMIT|ROLLBACK)\\b",
            Pattern.CASE_INSENSITIVE);

    private final UserStore userStore;
    private final UserPermissionPolicy permissionPolicy;
    private final UserResourcePolicy resourcePolicy;

    public FeaturePermissionAccess(
                                   UserStore userStore,
                                   UserPermissionPolicy permissionPolicy,
                                   UserResourcePolicy resourcePolicy) {
        this.userStore = userStore;
        this.permissionPolicy = permissionPolicy;
        this.resourcePolicy = resourcePolicy;
    }

    public void requirePermission(String feature) {
        if (UserContext.isApiTokenAuth()) {
            requireApiTokenFeature(feature);
            return;
        }
        permissionPolicy.requirePermission(requireCurrentUser(), feature);
    }

    public void requireSqlExecute(String sql) {
        requirePermission(UserFeaturePermission.WORKBENCH_CONSOLE_RUN);
        if (requiresWriteAccess(sql)) {
            requirePermission(UserFeaturePermission.WORKBENCH_CONSOLE_DANGEROUS_SQL);
        }
    }

    public void requireExplorerContextDangerous() {
        requirePermission(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_DANGEROUS);
    }

    /**
     * 删除 Explorer 节点：访客可删会话目录内的分组/连接；表/危险操作仍走 dangerous 权限。
     */
    public void requireExplorerNodeDelete(boolean catalogStructureNode) {
        if (UserContext.isApiTokenAuth()) {
            requireApiTokenFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_DANGEROUS);
            return;
        }
        if (catalogStructureNode && UserContext.isGuest() && resourcePolicy.canWrite(UserResource.CONNECTION_CATALOG)) {
            return;
        }
        requireExplorerContextDangerous();
    }

    public void requireExplorerContextEdit() {
        requireExplorerCatalogMutation();
    }

    /** 连接目录/分组增改：访客会话目录由 {@link UserResourcePolicy} 单独裁决。 */
    public void requireExplorerCatalogMutation() {
        if (UserContext.isApiTokenAuth()) {
            requireApiTokenFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_EDIT);
            return;
        }
        if (UserContext.isGuest() && resourcePolicy.canWrite(UserResource.CONNECTION_CATALOG)) {
            return;
        }
        requirePermission(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_EDIT);
    }

    public void requireExplorerContextConnection() {
        if (UserContext.isApiTokenAuth()) {
            requireApiTokenFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_CONNECTION);
            return;
        }
        if (UserContext.isGuest() && resourcePolicy.canRead(UserResource.CONNECTION_CATALOG)) {
            return;
        }
        requirePermission(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_CONNECTION);
    }

    public void requireExplorerContextConsole() {
        requirePermission(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_CONSOLE);
    }

    public void requireExplorerContextExport() {
        requirePermission(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_EXPORT);
    }

    public void requireUtilTerminal() {
        requirePermission(UserFeaturePermission.UTIL_TERMINAL);
    }

    /** 展开 database/schema 下目录节点时校验（模型 / 工作区 / AI 可配置；schema 对象组随数据库入口）。 */
    public void requireExplorerCatalogFolder(String folderLabel) {
        if (UserContext.isApiTokenAuth()) {
            requireApiTokenCatalogFolder(folderLabel);
            return;
        }
        if (folderLabel == null || folderLabel.isBlank()) {
            return;
        }
        UserEntity user = requireCurrentUser();
        String label = folderLabel.trim().toLowerCase(Locale.ROOT);
        if (SCHEMA_CATALOG_FOLDER_LABELS.contains(label)) {
            permissionPolicy.requirePermission(user, UserFeaturePermission.NAV_DATABASE);
            return;
        }
        if ("models".equals(label)) {
            permissionPolicy.requirePermission(user, UserFeaturePermission.WORKBENCH_EXPLORER_CATALOG_MODELS);
            return;
        }
        if ("workspaces".equals(label)) {
            permissionPolicy.requirePermission(user, UserFeaturePermission.WORKBENCH_EXPLORER_CATALOG_WORKSPACES);
            return;
        }
        if ("ai".equals(label) || "semantics".equals(label)) {
            permissionPolicy.requirePermission(user, UserFeaturePermission.WORKBENCH_EXPLORER_CATALOG_AI);
        }
    }

    public java.util.List<TreeNode> filterCatalogFolderChildren(java.util.List<TreeNode> children) {
        if (children == null || children.isEmpty()) {
            return children;
        }
        if (UserContext.isApiTokenAuth()) {
            return children.stream()
                    .filter(node -> {
                        if (node == null || !"folder".equals(node.getType())) {
                            return true;
                        }
                        return canAccessCatalogFolderForApiToken(node.getLabel());
                    })
                    .toList();
        }
        UserEntity user = requireCurrentUser();
        return children.stream()
                .filter(node -> {
                    if (node == null || !"folder".equals(node.getType())) {
                        return true;
                    }
                    return canAccessCatalogFolder(node.getLabel(), user);
                })
                .toList();
    }

    private boolean canAccessCatalogFolder(String folderLabel, UserEntity user) {
        if (folderLabel == null || folderLabel.isBlank()) {
            return true;
        }
        String label = folderLabel.trim().toLowerCase(Locale.ROOT);
        if (SCHEMA_CATALOG_FOLDER_LABELS.contains(label)) {
            return permissionPolicy.hasPermission(user, UserFeaturePermission.NAV_DATABASE);
        }
        if ("models".equals(label)) {
            return permissionPolicy.hasPermission(user, UserFeaturePermission.WORKBENCH_EXPLORER_CATALOG_MODELS);
        }
        if ("workspaces".equals(label)) {
            return permissionPolicy.hasPermission(user, UserFeaturePermission.WORKBENCH_EXPLORER_CATALOG_WORKSPACES);
        }
        if ("ai".equals(label) || "semantics".equals(label)) {
            return permissionPolicy.hasPermission(user, UserFeaturePermission.WORKBENCH_EXPLORER_CATALOG_AI);
        }
        return true;
    }

    private boolean canAccessCatalogFolderForApiToken(String folderLabel) {
        if (folderLabel == null || folderLabel.isBlank()) {
            return true;
        }
        String label = folderLabel.trim().toLowerCase(Locale.ROOT);
        if (SCHEMA_CATALOG_FOLDER_LABELS.contains(label)) {
            return ApiTokenFeatureScopes.allows(currentApiTokenScopes(), UserFeaturePermission.NAV_DATABASE);
        }
        if ("models".equals(label)) {
            return ApiTokenFeatureScopes.allows(
                    currentApiTokenScopes(), UserFeaturePermission.WORKBENCH_EXPLORER_CATALOG_MODELS);
        }
        if ("workspaces".equals(label)) {
            return ApiTokenFeatureScopes.allows(
                    currentApiTokenScopes(), UserFeaturePermission.WORKBENCH_EXPLORER_CATALOG_WORKSPACES);
        }
        if ("ai".equals(label) || "semantics".equals(label)) {
            return ApiTokenFeatureScopes.allows(
                    currentApiTokenScopes(), UserFeaturePermission.WORKBENCH_EXPLORER_CATALOG_AI);
        }
        return true;
    }

    private void requireApiTokenCatalogFolder(String folderLabel) {
        if (folderLabel == null || folderLabel.isBlank()) {
            return;
        }
        String label = folderLabel.trim().toLowerCase(Locale.ROOT);
        if (SCHEMA_CATALOG_FOLDER_LABELS.contains(label)) {
            requireApiTokenFeature(UserFeaturePermission.NAV_DATABASE);
            return;
        }
        if ("models".equals(label)) {
            requireApiTokenFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CATALOG_MODELS);
            return;
        }
        if ("workspaces".equals(label)) {
            requireApiTokenFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CATALOG_WORKSPACES);
            return;
        }
        if ("ai".equals(label) || "semantics".equals(label)) {
            requireApiTokenFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CATALOG_AI);
        }
    }

    public void requireRedisCommand(String command) {
        requireExplorerContextConsole();
        if (isRedisDangerousCommand(command)) {
            requireExplorerContextDangerous();
        }
    }

    /**
     * API Token authorization is the intersection of scope→feature mapping and the bound
     * user's RBAC. Scope alone must never elevate past the user's effective permissions.
     */
    private void requireApiTokenFeature(String feature) {
        if (!ApiTokenFeatureScopes.allows(currentApiTokenScopes(), feature)) {
            throw new IllegalArgumentException(API_TOKEN_PERMISSION_DENIED);
        }
        permissionPolicy.requirePermission(requireCurrentUser(), feature);
    }

    private static Set<String> currentApiTokenScopes() {
        UserContext.Snapshot snapshot = UserContext.snapshotOrNull();
        if (snapshot == null || snapshot.apiTokenScopes() == null) {
            return Set.of();
        }
        return snapshot.apiTokenScopes();
    }

    private UserEntity requireCurrentUser() {
        Long userId = UserContext.requireUserId();
        return userStore.findById(userId).orElseThrow(UnauthorizedException::new);
    }

    /**
     * Commands that mutate or destroy keys (beyond normal GET/SET console use).
     * Hard-blocked admin verbs ({@code FLUSHALL}, {@code CONFIG}, …) stay in
     * {@code RedisCommandPolicy}; this set elevates allowed destructive verbs to
     * {@link UserFeaturePermission#WORKBENCH_EXPLORER_CONTEXT_DANGEROUS}.
     */
    private static final Set<String> REDIS_DANGEROUS_COMMANDS = Set.of(
            "DEL",
            "UNLINK",
            "RENAME",
            "RENAMENX",
            "MOVE",
            "COPY",
            "LTRIM",
            "FLUSHALL",
            "FLUSHDB",
            "SWAPDB",
            "RESTORE",
            "MIGRATE"
    );

    private static boolean isRedisDangerousCommand(String command) {
        if (command == null || command.isBlank()) {
            return false;
        }
        String token = command.trim();
        int space = -1;
        for (int i = 0; i < token.length(); i++) {
            if (Character.isWhitespace(token.charAt(i))) {
                space = i;
                break;
            }
        }
        String verb = (space < 0 ? token : token.substring(0, space)).toUpperCase(Locale.ROOT);
        return REDIS_DANGEROUS_COMMANDS.contains(verb);
    }

    private static boolean requiresWriteAccess(String sql) {
        if (sql == null || sql.isBlank()) {
            return false;
        }
        return SQL_WRITE.matcher(sql.trim()).find();
    }
}
