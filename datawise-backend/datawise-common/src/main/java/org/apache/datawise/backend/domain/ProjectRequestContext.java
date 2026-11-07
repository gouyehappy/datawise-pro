package org.apache.datawise.backend.domain;

/**
 * 请求级项目覆盖（由 server Filter 写入；config 层无 servlet 依赖）。
 */
public final class ProjectRequestContext {

    private static final ThreadLocal<String> PROJECT_ID = new ThreadLocal<>();
    private static final ThreadLocal<Boolean> SCOPE_ALL = new ThreadLocal<>();

    private ProjectRequestContext() {
    }

    public static void set(String projectId, boolean scopeAll) {
        if (projectId != null && !projectId.isBlank()) {
            PROJECT_ID.set(projectId.trim());
        } else {
            PROJECT_ID.remove();
        }
        SCOPE_ALL.set(scopeAll);
    }

    public static String projectIdOverride() {
        return PROJECT_ID.get();
    }

    public static boolean isScopeAll() {
        return Boolean.TRUE.equals(SCOPE_ALL.get());
    }

    public static void clear() {
        PROJECT_ID.remove();
        SCOPE_ALL.remove();
    }
}
