/** 设置 → 插件分区：对照预设区块 DOM id */
export const SETTINGS_PLUGIN_REFERENCE_PRESET_ANCHOR = 'settings-plugin-reference-preset'

/** 插件页：预设差异折叠区 DOM id */
export const PLUGIN_PRESET_DIFF_ANCHOR = 'plugin-preset-diff'

export interface PluginCatalogAuditExitInput {
    consistencyIssueCount: number
    metadataIssueCount: number
    strict: boolean
}

/** 详情弹窗：是否展示「对齐全部差异」入口 */
export function shouldShowPresetAlignAllAction(
    conflictCount: number,
    currentPluginMismatch: boolean,
): boolean {
    return conflictCount > 1 || (conflictCount > 0 && !currentPluginMismatch)
}

/** audit:plugin-catalog 退出码：默认仅 ID 集合不一致失败；--strict 时 metadata 规则也失败 */
export function resolvePluginCatalogAuditExitCode(input: PluginCatalogAuditExitInput): number {
    if (input.consistencyIssueCount > 0) return 1
    if (input.strict && input.metadataIssueCount > 0) return 1
    return 0
}
