export default {
    title: 'Notifications',
    unread: '{count} unread',
    markAllRead: 'Mark all read',
    clearRead: 'Clear read',
    clearAll: 'Clear all',
    empty: 'No notifications',
    emptyHint: 'Export results, updates, and other important messages appear here',
    delete: 'Delete',
    markRead: 'Mark read',
    collapse: 'Collapse',
    groups: {
        system: 'System',
        export: 'Export',
        workspace: 'Workspace',
        info: 'Messages',
    },
    actions: {
        openSettings: 'Open settings',
        gotIt: 'Got it',
        dismiss: 'Dismiss',
    },
    menu: {
        more: 'More actions',
    },
    categories: {
        system: 'System',
        export: 'Export',
        workspace: 'Workspace',
        info: 'Info',
    },
    messages: {
        welcome: {
            title: 'Welcome',
            body: 'The database workbench is ready. Start from the connection tree on the left.',
        },
        exportDone: {
            title: 'Export complete',
            body: '{name} was exported successfully.',
        },
        aiReady: {
            title: 'AI Agent ready',
            body: 'Open AI Agent from the sidebar for natural-language SQL and analysis pipelines.',
        },
        systemLayout: {
            title: 'Layout saved',
            body: 'Window size, panel widths, and toolbar visibility were saved locally.',
        },
        systemTheme: {
            title: 'Theme updated',
            body: 'Appearance, background, or accent color was saved locally.',
        },
        systemEditor: {
            title: 'Editor settings updated',
            body: 'Font, theme, or editor preferences were saved for the SQL console.',
        },
        systemLocale: {
            title: 'Language switched',
            body: 'The UI language was saved to local configuration.',
        },
        systemConfigImport: {
            title: 'Configuration imported',
            body: 'Layout, theme, editor, and data source settings were restored from JSON.',
        },
        systemConfigExport: {
            title: 'Configuration exported',
            body: 'Current local settings were exported as datawise-config.xml.',
        },
        alertConnectionHealth: {
            title: 'Connection unavailable',
            body: 'Probe failed for "{name}". Check network or connection settings.',
        },
        alertSlowQuery: {
            title: 'Slow query',
            body: '{connection}Duration {duration} (threshold {threshold}ms): {sql}',
        },
        scheduledTaskOk: {
            title: 'Scheduled task completed',
            body: '"{name}" ({type}) finished successfully. {message}',
        },
        scheduledTaskFailed: {
            title: 'Scheduled task failed',
            body: '"{name}" failed: {message}',
        },
        metricDefinitionChanged: {
            title: 'Metric definition updated',
            body: '"{name}" changed and lineage impact should be re-checked.',
        },
        viewModelLineageChanged: {
            title: 'View model SQL changed',
            body: '"{name}" was updated; {count} downstream model(s) may be affected: {downstream}',
        },
    },
    time: {
        justNow: 'Just now',
        minutesAgo: '{count} min ago',
        hoursAgo: '{count} hr ago',
        daysAgo: '{count} d ago',
    },
}
