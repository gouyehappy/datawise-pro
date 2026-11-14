import type {SettingsSection} from '@/core/types'

export type SettingsSearchHit = {
    section: SettingsSection
    /** i18n key for display label */
    labelKey: string
    /** Extra keywords (zh/en mixed) for fuzzy match */
    keywords: string[]
    /** Optional DOM id inside the panel for scroll/highlight */
    anchorId?: string
}

/**
 * 设置内搜索索引：分区级 + 常见控件关键词。
 * 命中后跳到对应 section；有 anchorId 时滚动并短暂高亮。
 */
export const SETTINGS_SEARCH_INDEX: SettingsSearchHit[] = [
    {
        section: 'basic',
        labelKey: 'settings.nav.basic',
        keywords: [
            'basic',
            'theme',
            '语言',
            'language',
            'locale',
            '外观',
            '基础',
            'snapshot',
            '快照',
            'config',
            'density',
            '疏密',
            '紧凑',
            '宽松',
            '文字大小',
        ],
        anchorId: 'settings-basic',
    },
    {
        section: 'configPortability',
        labelKey: 'settings.nav.configPortability',
        keywords: ['portability', 'migrate', 'transfer', 'export', 'import', '导出', '导入', '迁移', '换机', 'dwprofile', 'passphrase', '口令'],
        anchorId: 'settings-config-portability',
    },
    {
        section: 'configCloudSync',
        labelKey: 'settings.nav.configCloudSync',
        keywords: [
            'cloud sync',
            'webdav',
            'nextcloud',
            'nas',
            'redacted',
            '同步',
            '云同步',
            '凭据',
            'omitted',
            'dwprofile',
        ],
        anchorId: 'settings-config-cloud-sync',
    },
    {
        section: 'layout',
        labelKey: 'settings.nav.layout',
        keywords: [
            'layout',
            '侧栏',
            'rail',
            '布局',
            '界面',
            '注释',
            'comment',
            '资源树',
            'explorer',
            '语义',
            'semantic',
        ],
        anchorId: 'settings-layout-explorer-display',
    },
    {
        section: 'shortcuts',
        labelKey: 'settings.nav.shortcuts',
        keywords: ['shortcut', '快捷键', 'hotkey', 'keymap'],
        anchorId: 'settings-shortcuts',
    },
    {
        section: 'editor',
        labelKey: 'settings.nav.editor',
        keywords: ['editor', 'font', '字体', '代码外观', 'monaco', '字号', '主题'],
        anchorId: 'settings-editor',
    },
    {
        section: 'querySafety',
        labelKey: 'settings.nav.querySafety',
        keywords: [
            'query',
            '查询',
            '慢查询',
            '结果行',
            '危险 SQL',
            'DROP',
            'TRUNCATE',
            '生产性能',
            '分页',
        ],
        anchorId: 'settings-query-safety',
    },
    {
        section: 'sqlEditor',
        labelKey: 'settings.nav.sqlEditor',
        keywords: ['sql', 'autocomplete', '补全', '只读', 'readonly', '编辑行为'],
        anchorId: 'settings-sql-editor',
    },
    {
        section: 'sqlSnippets',
        labelKey: 'settings.nav.sqlEditorSnippets',
        keywords: ['snippet', '片段', '模板'],
        anchorId: 'settings-sql-snippets',
    },
    {
        section: 'connectionHealth',
        labelKey: 'settings.nav.connectionHealth',
        keywords: ['health', '连接健康', 'probe'],
        anchorId: 'settings-connection-health',
    },
    {
        section: 'systemMetrics',
        labelKey: 'settings.nav.systemMetrics',
        keywords: ['metrics', '监控', 'prometheus'],
        anchorId: 'settings-system-metrics',
    },
    {
        section: 'runtime',
        labelKey: 'settings.nav.runtime',
        keywords: ['runtime', 'jre', 'connector', '驱动', '连接器', '安装'],
        anchorId: 'settings-runtime',
    },
    {
        section: 'projects',
        labelKey: 'settings.nav.projects',
        keywords: ['project', '项目'],
        anchorId: 'settings-projects',
    },
    {
        section: 'ai',
        labelKey: 'settings.nav.aiModels',
        keywords: ['ai', 'model', 'openai', '模型'],
        anchorId: 'settings-ai',
    },
    {
        section: 'dataAgent',
        labelKey: 'settings.nav.dataAgent',
        keywords: ['dataagent', 'agent', 'rag'],
        anchorId: 'settings-data-agent',
    },
    {
        section: 'mcp',
        labelKey: 'settings.nav.mcp',
        keywords: ['mcp', 'cursor', 'claude', 'model context', 'allowlist', '权限'],
        anchorId: 'settings-mcp',
    },
    {
        section: 'integrations',
        labelKey: 'settings.nav.integrations',
        keywords: ['webhook', 'oidc', '集成', '通知'],
        anchorId: 'settings-integrations',
    },
    {
        section: 'secrets',
        labelKey: 'settings.nav.secrets',
        keywords: ['secret', '密钥', 'master key'],
        anchorId: 'settings-secrets',
    },
    {
        section: 'backupCenter',
        labelKey: 'settings.nav.backupCenter',
        keywords: ['backup', '备份', 'restore'],
        anchorId: 'settings-backup',
    },
    {
        section: 'userPermissions',
        labelKey: 'settings.nav.userPermissions',
        keywords: ['permission', '权限', '角色', 'role', '只读'],
        anchorId: 'settings-user-permissions',
    },
    {
        section: 'tenants',
        labelKey: 'settings.nav.tenants',
        keywords: ['tenant', '租户'],
        anchorId: 'settings-tenants',
    },
    {
        section: 'profile',
        labelKey: 'settings.nav.profile',
        keywords: ['profile', '账号', '密码', 'password'],
        anchorId: 'settings-profile',
    },
    {
        section: 'plugins',
        labelKey: 'settings.nav.plugins',
        keywords: ['plugin', '插件'],
        anchorId: 'settings-plugins',
    },
    {
        section: 'about',
        labelKey: 'settings.nav.about',
        keywords: ['about', 'version', '版本', '更新'],
        anchorId: 'settings-about',
    },
]

function normalizeQuery(q: string): string {
    return q.trim().toLowerCase()
}

export function searchSettingsIndex(
    query: string,
    options: {
        translate: (key: string) => string
        allowedSections: ReadonlySet<SettingsSection>
    },
): SettingsSearchHit[] {
    const q = normalizeQuery(query)
    if (!q) return []
    const hits: Array<SettingsSearchHit & {score: number}> = []
    for (const item of SETTINGS_SEARCH_INDEX) {
        if (!options.allowedSections.has(item.section)) continue
        const label = options.translate(item.labelKey).toLowerCase()
        const haystack = [label, item.section, ...item.keywords].join(' ').toLowerCase()
        if (!haystack.includes(q) && !q.split(/\s+/).every((part) => haystack.includes(part))) {
            continue
        }
        let score = 0
        if (label.startsWith(q) || item.section === q) score += 40
        if (label.includes(q)) score += 20
        if (item.keywords.some((k) => k.toLowerCase().includes(q))) score += 10
        hits.push({...item, score})
    }
    return hits.sort((a, b) => b.score - a.score).map(({score: _s, ...rest}) => rest)
}

export function flashSettingsAnchor(anchorId: string | undefined) {
    if (!anchorId || typeof document === 'undefined') return
    const tryScroll = (attempt: number) => {
        const el = document.getElementById(anchorId)
        if (!el) {
            if (attempt < 8) {
                window.setTimeout(() => tryScroll(attempt + 1), 50 * (attempt + 1))
            }
            return
        }
        el.scrollIntoView({behavior: 'smooth', block: 'start'})
        el.classList.add('settings-search-flash')
        window.setTimeout(() => el.classList.remove('settings-search-flash'), 1600)
    }
    window.requestAnimationFrame(() => tryScroll(0))
}
