package org.apache.datawise.backend.service;

/**
 * 用户资源域：菜单/配置/数据源/AI/用户产出，统一由 {@link UserResourcePolicy} 裁决。
 */
public enum UserResource {
    LAYOUT_MENU,
    APP_CONFIG,
    AI_PREFERENCES,
    AI_KNOWLEDGE,
    AI_TABLE_TAGS,
    AI_ANALYSIS_CANVAS,
    SEMANTIC_METRICS,
    FEDERATED_VIEWS,
    SCHEMA_DRIFT_MONITORS,
    SCHEDULED_TASKS,
    CONNECTION_CATALOG,
    WORKSPACE_SCRIPTS,
    /** SQL 历史、收藏控制台、导出任务等用户产出数据 */
    WORKSPACE_USER_DATA,
    /** 表数据网格 DML 本地审计（time-travel 回滚） */
    TABLE_DATA_AUDIT,
    SQL_SNIPPETS_PERSONAL,
    SQL_SNIPPETS_SHARED,
    UPDATER_PREFERENCES,
    CONNECTIONS_XML_BULK
}
