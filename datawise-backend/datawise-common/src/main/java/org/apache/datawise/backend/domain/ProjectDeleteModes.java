package org.apache.datawise.backend.domain;

/**
 * 删除项目模式（见设计 §5.1）。
 */
public final class ProjectDeleteModes {

    /** 仅当无连接时可删（默认）。 */
    public static final String EMPTY_ONLY = "empty-only";

    /** 连接迁入 Default 后删项目。 */
    public static final String MOVE_TO_DEFAULT = "move-to-default";

    /** 删项目元数据 + 文档树；连接一并删需显式 confirmPurgeConnections。 */
    public static final String PURGE = "purge";

    private ProjectDeleteModes() {
    }

    public static String normalize(String mode) {
        if (mode == null || mode.isBlank()) {
            return EMPTY_ONLY;
        }
        String trimmed = mode.trim().toLowerCase();
        if (MOVE_TO_DEFAULT.equals(trimmed) || PURGE.equals(trimmed) || EMPTY_ONLY.equals(trimmed)) {
            return trimmed;
        }
        throw new IllegalArgumentException("PROJECT_DELETE_MODE_INVALID");
    }
}
