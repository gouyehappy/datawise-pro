/**
 * 仓库根目录 config/ 统一配置布局。
 * connections.xml 是连接配置的「小型数据库」：前端增删改直接读写该 XML。
 *
 * config/
 *   workspace.xml              # 工作区元数据（保留兼容；脚本目录固定为 scripts/）
 *   connections.xml            # 数据库连接与分组（密码 AES 加密，勿提交 git）
 *   connections.xml.example    # 连接配置模板
 *   app.xml                    # 前端应用偏好汇总（不含 tabs / AI / explorer UI / window / localFiles）
 *   users/{id}/ai-preferences.json
 *   users/{id}/window.json
 *   users/{id}/local-files.json
 *   users/{id}/tenants/{tid}/workspace-session.json  # 打开的 tabs / 分组
 *   users/{id}/tenants/{tid}/explorer-ui.json
 *   updater.xml                # 更新通知设置
 *   sql-snippets.shared.xml    # 共享 SQL 片段
 *   sql-snippets.personal.xml  # 个人 SQL 片段
 *   users.json                 # 本地用户（复制 users.json.example）
 *   users.json.example         # 用户模板
 *   teams.json                 # 团队与成员
 *   sql-history.json           # SQL 执行历史
 *   saved-consoles.json        # 已保存控制台
 *   export-tasks.json          # 导出任务
 *   notifications.json         # 通知
 *   cache/schema/              # schema 树缓存（可再生成）
 *   scripts/                   # 实例 SQL 脚本（console.sql 等）
 *     {connectionId}/
 *       {databaseName}/
 *         console.sql
 *         Script-1.sql
 *   exports/                   # 表数据 / 查询结果网格导出（csv/xlsx/json/sql 等）
 */
export const CONFIG_DIR = 'config'

export const CONFIG_FILES = {
    app: `${CONFIG_DIR}/app.xml`,
    workspace: `${CONFIG_DIR}/workspace.xml`,
    connections: `${CONFIG_DIR}/connections.xml`,
    connectionsExample: `${CONFIG_DIR}/connections.xml.example`,
    updater: `${CONFIG_DIR}/updater.xml`,
    sqlSnippetsShared: `${CONFIG_DIR}/sql-snippets.shared.xml`,
    sqlSnippetsPersonal: `${CONFIG_DIR}/sql-snippets.personal.xml`,
    users: `${CONFIG_DIR}/users.json`,
    usersExample: `${CONFIG_DIR}/users.json.example`,
    teams: `${CONFIG_DIR}/teams.json`,
    sqlHistory: `${CONFIG_DIR}/sql-history.json`,
    savedConsoles: `${CONFIG_DIR}/saved-consoles.json`,
    exportTasks: `${CONFIG_DIR}/export-tasks.json`,
    notifications: `${CONFIG_DIR}/notifications.json`,
    schemaCacheDir: `${CONFIG_DIR}/cache/schema`,
} as const

/** SQL 脚本根目录（固定为数据目录下的 scripts/） */
export const SCRIPTS_DIR = `${CONFIG_DIR}/scripts`

/** 单条实例 SQL 的磁盘路径模式 */
export function resolveInstanceSqlPath(
    connectionId: string,
    databaseName: string,
    fileName: string,
): string {
    return `${SCRIPTS_DIR}/${connectionId}/${databaseName}/${fileName}`
}

export const APP_CONFIG_EXPORT_FILENAME = 'datawise-config.xml'
