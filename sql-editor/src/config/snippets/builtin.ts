import {SQL_SNIPPETS, SQL_SLOT_SNIPPETS} from '@sql-editor/constants/snippets'
import type {SqlEditorShortcutsLayer, SqlSnippetConfig} from '@sql-editor/types'
import pluginSharedRaw from '@sql-editor/config/sql-snippets.shared.json'

/** 将内置常量表转为可编辑配置项（id 与 label 一致） */
export function buildDefaultSnippetConfigsFromConstants(): SqlSnippetConfig[] {
    const fromGlobal = SQL_SNIPPETS.map((item) => ({
        id: item.label,
        label: item.label,
        insertText: item.insertText,
        detail: item.detail ?? '',
        enabled: true,
        slots: [] as SqlSnippetConfig['slots'],
        builtin: true,
    }))

    const fromSlots = Object.entries(SQL_SLOT_SNIPPETS).flatMap(([slot, items]) =>
        (items ?? []).map((item) => ({
            id: item.label,
            label: item.label,
            insertText: item.insertText,
            detail: item.detail ?? '',
            enabled: true,
            slots: [slot] as SqlSnippetConfig['slots'],
            builtin: true,
        })),
    )

    const seen = new Set<string>()
    return [...fromGlobal, ...fromSlots].filter((item) => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
    })
}

/** 插件随包分发的团队通用片段（无个人配置时也可用） */
export function getPluginBundledSharedLayer(): SqlEditorShortcutsLayer {
    const raw = pluginSharedRaw as SqlEditorShortcutsLayer
    return {
        autoTableAlias: raw.autoTableAlias,
        snippets: Array.isArray(raw.snippets) ? raw.snippets : [],
    }
}
