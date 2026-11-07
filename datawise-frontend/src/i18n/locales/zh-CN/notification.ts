export default {
    title: '通知',
    unread: '未读 {count} 条',
    markAllRead: '全部已读',
    clearRead: '清除已读',
    clearAll: '清空全部',
    empty: '暂无通知',
    emptyHint: '导出完成、版本更新等重要消息会出现在这里',
    delete: '删除',
    markRead: '标记已读',
    collapse: '收起',
    groups: {
        system: '系统',
        export: '导出',
        workspace: '工作区',
        info: '消息',
    },
    actions: {
        openSettings: '打开设置',
        gotIt: '知道了',
        dismiss: '不再提示',
    },
    menu: {
        more: '更多操作',
    },
    categories: {
        system: '系统',
        export: '导出',
        workspace: '工作区',
        info: '消息',
    },
    messages: {
        welcome: {
            title: '欢迎使用',
            body: '数据库工作台已就绪，可在左侧连接树开始探索。',
        },
        exportDone: {
            title: '导出完成',
            body: '{name} 已成功导出到本地。',
        },
        aiReady: {
            title: 'AI Agent 已就绪',
            body: '左侧导航可进入 AI Agent，支持自然语言生成 SQL 与分析流水线。',
        },
        systemLayout: {
            title: '界面布局已保存',
            body: '窗口大小、面板宽度、工具栏显示等调整已写入本地配置。',
        },
        systemTheme: {
            title: '主题已更新',
            body: '外观、背景或主色变更已保存到本地。',
        },
        systemEditor: {
            title: '编辑器设置已更新',
            body: '字体、主题或编辑偏好已保存，将应用到 SQL 控制台。',
        },
        systemLocale: {
            title: '语言已切换',
            body: '界面语言变更已保存到本地配置。',
        },
        systemConfigImport: {
            title: '配置已导入',
            body: '已从 JSON 文件恢复布局、主题、编辑器与数据源设置。',
        },
        systemConfigExport: {
            title: '配置已导出',
            body: '当前本地配置已导出为 datawise-config.xml。',
        },
        alertConnectionHealth: {
            title: '连接不可用',
            body: '「{name}」探测失败，请检查网络或连接配置。',
        },
        alertSlowQuery: {
            title: '慢查询',
            body: '{connection}耗时 {duration}（阈值 {threshold}ms）：{sql}',
        },
        scheduledTaskOk: {
            title: '定时任务完成',
            body: '「{name}」（{type}）已成功执行。{message}',
        },
        scheduledTaskFailed: {
            title: '定时任务失败',
            body: '「{name}」执行失败：{message}',
        },
        metricDefinitionChanged: {
            title: '指标口径已更新',
            body: '「{name}」发生口径变更，请重新检查相关血缘影响。',
        },
        viewModelLineageChanged: {
            title: '视图模型 SQL 已变更',
            body: '「{name}」的 SQL 已更新，{count} 个下游模型可能受影响：{downstream}',
        },
    },
    time: {
        justNow: '刚刚',
        minutesAgo: '{count} 分钟前',
        hoursAgo: '{count} 小时前',
        daysAgo: '{count} 天前',
    },
}
