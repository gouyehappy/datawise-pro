package org.apache.datawise.backend.domain;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * 功能权限键：与前端 feature-permission.types 对齐，控制导航/菜单/按钮可见性。
 */
public final class UserFeaturePermission {

    public static final String NAV_DATABASE = "nav.database";
    public static final String NAV_DASHBOARD = "nav.dashboard";
    public static final String NAV_AI = "nav.ai";
    public static final String NAV_PLUGIN = "nav.plugin";
    public static final String NAV_CONNECTOR_MARKET = "nav.connectorMarket";
    public static final String NAV_PLUGIN_DEV = "nav.pluginDev";
    public static final String NAV_TEAM = "nav.team";
    public static final String NAV_SETTINGS = "nav.settings";

    public static final String UTIL_REFRESH = "util.refresh";
    public static final String UTIL_NOTIFY = "util.notify";
    public static final String UTIL_FEEDBACK = "util.feedback";
    public static final String UTIL_TERMINAL = "util.terminal";

    public static final String SHORTCUT_INFO = "shortcut.info";
    public static final String SHORTCUT_HISTORY = "shortcut.history";
    public static final String SHORTCUT_MONITOR = "shortcut.monitor";
    public static final String SHORTCUT_CONSOLE = "shortcut.console";
    public static final String SHORTCUT_MIGRATION = "shortcut.migration";
    public static final String SHORTCUT_EXPORT = "shortcut.export";

    public static final String PROFILE_SETTINGS = "profile.settings";
    public static final String PROFILE_ONBOARDING = "profile.onboarding";
    public static final String PROFILE_TEAM = "profile.team";

    public static final String TITLE_BAR_CONFIG = "titleBar.config";
    public static final String TITLE_BAR_HELP = "titleBar.help";
    public static final String TITLE_BAR_WORKSPACE = "titleBar.workspace";

    public static final String WORKBENCH_CONSOLE_RUN = "workbench.console.run";
    public static final String WORKBENCH_CONSOLE_EXPLAIN = "workbench.console.explain";
    public static final String WORKBENCH_CONSOLE_DANGEROUS_SQL = "workbench.console.dangerousSql";
    public static final String WORKBENCH_CONSOLE_SAVE = "workbench.console.save";
    public static final String WORKBENCH_CONSOLE_SAVE_AS = "workbench.console.saveAs";
    public static final String WORKBENCH_CONSOLE_BOOKMARK = "workbench.console.bookmark";
    public static final String WORKBENCH_CONSOLE_VIEW_MODEL = "workbench.console.viewModel";
    public static final String WORKBENCH_CONSOLE_FORMAT = "workbench.console.format";
    public static final String WORKBENCH_CONSOLE_FULLSCREEN = "workbench.console.fullscreen";
    public static final String WORKBENCH_CONSOLE_AI = "workbench.console.ai";
    public static final String WORKBENCH_CONSOLE_TRANSACTION = "workbench.console.transaction";

    public static final String WORKBENCH_EXPLORER_ADD = "workbench.explorer.add";
    public static final String WORKBENCH_EXPLORER_REFRESH = "workbench.explorer.refresh";
    public static final String WORKBENCH_EXPLORER_LOCATE = "workbench.explorer.locate";
    public static final String WORKBENCH_EXPLORER_SETTINGS = "workbench.explorer.settings";
    public static final String WORKBENCH_EXPLORER_SEARCH = "workbench.explorer.search";

    public static final String WORKBENCH_EXPLORER_CATALOG_MODELS = "workbench.explorer.catalog.models";
    public static final String WORKBENCH_EXPLORER_CATALOG_WORKSPACES = "workbench.explorer.catalog.workspaces";
    public static final String WORKBENCH_EXPLORER_CATALOG_AI = "workbench.explorer.catalog.ai";

    public static final String WORKBENCH_EXPLORER_CONTEXT_OPEN = "workbench.explorer.context.open";
    public static final String WORKBENCH_EXPLORER_CONTEXT_CONSOLE = "workbench.explorer.context.console";
    public static final String WORKBENCH_EXPLORER_CONTEXT_EDIT = "workbench.explorer.context.edit";
    public static final String WORKBENCH_EXPLORER_CONTEXT_EXPORT = "workbench.explorer.context.export";
    public static final String WORKBENCH_EXPLORER_CONTEXT_COPY = "workbench.explorer.context.copy";
    public static final String WORKBENCH_EXPLORER_CONTEXT_PIN = "workbench.explorer.context.pin";
    public static final String WORKBENCH_EXPLORER_CONTEXT_CONNECTION = "workbench.explorer.context.connection";
    public static final String WORKBENCH_EXPLORER_CONTEXT_DANGEROUS = "workbench.explorer.context.dangerous";

    public static final String WORKBENCH_TAB_NEW = "workbench.tab.new";
    public static final String WORKBENCH_RESULT_AI_SUMMARY = "workbench.result.aiSummary";

    public static final String SETTINGS_BASIC = "settings.basic";
    public static final String SETTINGS_LAYOUT = "settings.layout";
    public static final String SETTINGS_PROFILE = "settings.profile";
    public static final String SETTINGS_EDITOR = "settings.editor";
    public static final String SETTINGS_SHORTCUTS = "settings.shortcuts";
    public static final String SETTINGS_SQL_EDITOR = "settings.sqlEditor";
    public static final String SETTINGS_SQL_SNIPPETS = "settings.sqlSnippets";
    public static final String SETTINGS_CONNECTION_HEALTH = "settings.connectionHealth";
    public static final String SETTINGS_SYSTEM_METRICS = "settings.systemMetrics";
    public static final String SETTINGS_AI = "settings.ai";
    public static final String SETTINGS_DATA_AGENT = "settings.dataAgent";
    public static final String SETTINGS_PLUGINS = "settings.plugins";
    public static final String SETTINGS_ABOUT = "settings.about";
    public static final String SETTINGS_INTEGRATIONS = "settings.integrations";
    public static final String SETTINGS_BACKUP_CENTER = "settings.backupCenter";
    public static final String SETTINGS_USER_PERMISSIONS = "settings.userPermissions";
    public static final String SETTINGS_TENANTS = "settings.tenants";
    public static final String SETTINGS_PROJECTS = "settings.projects";

    public static final Set<String> ALL = Set.of(
            NAV_DATABASE,
            NAV_DASHBOARD,
            NAV_AI,
            NAV_PLUGIN,
            NAV_CONNECTOR_MARKET,
            NAV_PLUGIN_DEV,
            NAV_TEAM,
            NAV_SETTINGS,
            UTIL_REFRESH,
            UTIL_NOTIFY,
            UTIL_FEEDBACK,
            UTIL_TERMINAL,
            SHORTCUT_INFO,
            SHORTCUT_HISTORY,
            SHORTCUT_MONITOR,
            SHORTCUT_CONSOLE,
            SHORTCUT_MIGRATION,
            SHORTCUT_EXPORT,
            PROFILE_SETTINGS,
            PROFILE_ONBOARDING,
            PROFILE_TEAM,
            TITLE_BAR_CONFIG,
            TITLE_BAR_HELP,
            TITLE_BAR_WORKSPACE,
            WORKBENCH_CONSOLE_RUN,
            WORKBENCH_CONSOLE_EXPLAIN,
            WORKBENCH_CONSOLE_DANGEROUS_SQL,
            WORKBENCH_CONSOLE_SAVE,
            WORKBENCH_CONSOLE_SAVE_AS,
            WORKBENCH_CONSOLE_BOOKMARK,
            WORKBENCH_CONSOLE_VIEW_MODEL,
            WORKBENCH_CONSOLE_FORMAT,
            WORKBENCH_CONSOLE_FULLSCREEN,
            WORKBENCH_CONSOLE_AI,
            WORKBENCH_CONSOLE_TRANSACTION,
            WORKBENCH_EXPLORER_ADD,
            WORKBENCH_EXPLORER_REFRESH,
            WORKBENCH_EXPLORER_LOCATE,
            WORKBENCH_EXPLORER_SETTINGS,
            WORKBENCH_EXPLORER_SEARCH,
            WORKBENCH_EXPLORER_CATALOG_MODELS,
            WORKBENCH_EXPLORER_CATALOG_WORKSPACES,
            WORKBENCH_EXPLORER_CATALOG_AI,
            WORKBENCH_EXPLORER_CONTEXT_OPEN,
            WORKBENCH_EXPLORER_CONTEXT_CONSOLE,
            WORKBENCH_EXPLORER_CONTEXT_EDIT,
            WORKBENCH_EXPLORER_CONTEXT_EXPORT,
            WORKBENCH_EXPLORER_CONTEXT_COPY,
            WORKBENCH_EXPLORER_CONTEXT_PIN,
            WORKBENCH_EXPLORER_CONTEXT_CONNECTION,
            WORKBENCH_EXPLORER_CONTEXT_DANGEROUS,
            WORKBENCH_TAB_NEW,
            WORKBENCH_RESULT_AI_SUMMARY,
            SETTINGS_BASIC,
            SETTINGS_LAYOUT,
            SETTINGS_PROFILE,
            SETTINGS_EDITOR,
            SETTINGS_SHORTCUTS,
            SETTINGS_SQL_EDITOR,
            SETTINGS_SQL_SNIPPETS,
            SETTINGS_CONNECTION_HEALTH,
            SETTINGS_SYSTEM_METRICS,
            SETTINGS_AI,
            SETTINGS_DATA_AGENT,
            SETTINGS_PLUGINS,
            SETTINGS_ABOUT,
            SETTINGS_INTEGRATIONS,
            SETTINGS_BACKUP_CENTER,
            SETTINGS_USER_PERMISSIONS,
            SETTINGS_TENANTS,
            SETTINGS_PROJECTS);

    private UserFeaturePermission() {
    }

    public static Map<String, Boolean> fullPreset() {
        return preset(true);
    }

    /** 仅工作台：数据库 Explorer + 工作区，隐藏其它模块。 */
    public static Map<String, Boolean> workbenchPreset() {
        Map<String, Boolean> preset = preset(false);
        preset.put(NAV_DATABASE, true);
        preset.put(UTIL_REFRESH, true);
        preset.put(SHORTCUT_INFO, true);
        preset.put(SHORTCUT_HISTORY, true);
        preset.put(SHORTCUT_CONSOLE, true);
        preset.put(WORKBENCH_CONSOLE_RUN, true);
        preset.put(WORKBENCH_EXPLORER_ADD, true);
        preset.put(WORKBENCH_EXPLORER_REFRESH, true);
        preset.put(WORKBENCH_EXPLORER_LOCATE, true);
        preset.put(WORKBENCH_EXPLORER_SEARCH, true);
        preset.put(WORKBENCH_EXPLORER_CONTEXT_OPEN, true);
        preset.put(WORKBENCH_EXPLORER_CONTEXT_CONSOLE, true);
        preset.put(WORKBENCH_EXPLORER_CONTEXT_EDIT, true);
        preset.put(WORKBENCH_EXPLORER_CONTEXT_COPY, true);
        preset.put(WORKBENCH_TAB_NEW, true);
        return preset;
    }

    private static Map<String, Boolean> preset(boolean granted) {
        Map<String, Boolean> map = new LinkedHashMap<>();
        for (String key : ALL) {
            map.put(key, granted);
        }
        return map;
    }
}
