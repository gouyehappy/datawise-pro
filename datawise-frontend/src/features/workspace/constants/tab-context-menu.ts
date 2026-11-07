/**
 * 工作区 Tab / 查询结果 Tab 的右键菜单项定义
 *
 * - getWorkspaceTabMenu：完整菜单（含左右关闭、重命名、复制）
 * - getResultTabMenu：结果 Tab 精简菜单（仅关闭类）
 */
import type {ContextMenuItem} from '@/core/types'
import type {ComposerTranslation} from 'vue-i18n'

export interface TabMenuContext {
    canCloseLeft: boolean
    canCloseRight: boolean
    /** 默认 true；表数据等 Tab 设为 false */
    canRename?: boolean
    /** SQL 控制台 Tab：显示保存子菜单 */
    showConsoleSave?: boolean
    /** 表详情 Tab：显示生成代码子菜单 */
    showTableCodegen?: boolean
    /** 表详情 Tab：显示假数据生成 */
    showTableFakeData?: boolean
    /** Tab 已在拖拽分组中时可解散 */
    canDissolveGroup?: boolean
    /** Tab is already a floating window inside the workspace */
    isFloated?: boolean
}

interface TabMenuI18nKeys {
    close: string
    closeOthers: string
    closeAll: string
    closeLeft: string
    closeRight: string
    rename: string
    copyTitle: string
}

export function buildClosableTabMenu(
    t: ComposerTranslation,
    keys: TabMenuI18nKeys,
    ctx: TabMenuContext,
): ContextMenuItem[] {
    const items: ContextMenuItem[] = []

    if (ctx.showConsoleSave) {
        items.push({
            id: 'save-submenu',
            label: t('workspace.tabSaveMenu'),
            children: [
                {id: 'save', label: t('workspace.tabSave'), shortcut: 'Ctrl+S'},
                {id: 'save-migration', label: t('workspace.tabSaveMigration'), icon: 'file'},
            ],
        })
        items.push({id: 'divider-save', label: '', divider: true})
    }

    items.push(
        {id: 'close', label: t(keys.close), shortcut: 'Ctrl+F4'},
        {id: 'close-others', label: t(keys.closeOthers)},
        {id: 'close-all', label: t(keys.closeAll), shortcut: 'Ctrl+Shift+F4'},
        {id: 'close-left', label: t(keys.closeLeft), disabled: !ctx.canCloseLeft},
        {id: 'close-right', label: t(keys.closeRight), disabled: !ctx.canCloseRight},
        {id: 'divider-1', label: '', divider: true},
        ...(ctx.isFloated
            ? [{id: 'dock-tab', label: t('workspace.tabFloatDock'), icon: 'pin' as const}]
            : [{id: 'float-tab', label: t('workspace.tabFloatPopOut'), icon: 'open-external' as const}]),
        {id: 'divider-float', label: '', divider: true},
        ...(ctx.canDissolveGroup
            ? [
                {id: 'rename-group', label: t('workspace.tabRenameGroup'), icon: 'edit' as const},
                {id: 'dissolve-group', label: t('workspace.tabDissolveGroup')},
                {id: 'divider-group', label: '', divider: true},
            ]
            : []),
        ...(ctx.canRename !== false
            ? [{id: 'rename', label: t(keys.rename), icon: 'edit' as const}]
            : []),
        {id: 'copy-title', label: t(keys.copyTitle), icon: 'copy'},
    )

    return items
}

export function getWorkspaceTabMenu(t: ComposerTranslation, ctx: TabMenuContext): ContextMenuItem[] {
    const base = buildClosableTabMenu(t, {
        close: 'workspace.tabClose',
        closeOthers: 'workspace.tabCloseOthers',
        closeAll: 'workspace.tabCloseAll',
        closeLeft: 'workspace.tabCloseLeft',
        closeRight: 'workspace.tabCloseRight',
        rename: 'workspace.tabRename',
        copyTitle: 'workspace.tabCopyTitle',
    }, ctx)

    if (!ctx.showTableCodegen && !ctx.showTableFakeData) {
        return base
    }

    const tableItems: ContextMenuItem[] = []
    if (ctx.showTableFakeData) {
        tableItems.push({
            id: 'generate-fake-data',
            label: t('workspace.fakeData.menu'),
            icon: 'import',
        })
    }
    if (ctx.showTableCodegen) {
        tableItems.push({
            id: 'generate-code-submenu',
            label: t('workspace.tableCodegen.menu'),
            icon: 'file',
            children: [
                {id: 'codegen-jpa', label: t('workspace.tableCodegen.templates.jpa'), icon: 'file'},
                {id: 'codegen-mybatis', label: t('workspace.tableCodegen.templates.mybatis'), icon: 'file'},
                {id: 'codegen-typescript', label: t('workspace.tableCodegen.templates.typescript'), icon: 'file'},
            ],
        })
    }
    if (tableItems.length) {
        tableItems.push({id: 'divider-table-tools', label: '', divider: true})
    }

    return [...tableItems, ...base]
}

export interface ResultTabMenuContext {
    canCompareWithPrevious?: boolean
    canCrossEnvCompare?: boolean
    canSuggestIndex?: boolean
}

export function getResultTabMenu(t: ComposerTranslation, ctx?: ResultTabMenuContext): ContextMenuItem[] {
    return [
        {
            id: 'suggest-index',
            label: t('queryResult.indexDraftAction'),
            icon: 'explain',
            disabled: !ctx?.canSuggestIndex,
        },
        {id: 'divider-index', label: '', divider: true},
        {
            id: 'compare-previous',
            label: t('queryResult.compareWithPrevious'),
            disabled: !ctx?.canCompareWithPrevious,
        },
        {
            id: 'cross-env-compare',
            label: t('queryResult.crossEnvCompare'),
            icon: 'table',
            disabled: !ctx?.canCrossEnvCompare,
        },
        {id: 'divider-compare', label: '', divider: true},
        {id: 'close', label: t('queryResult.close')},
        {id: 'close-others', label: t('queryResult.closeOthers')},
        {id: 'divider-1', label: '', divider: true},
        {id: 'close-all', label: t('queryResult.closeAll')},
    ]
}
