import {
    readPersonalSqlEditorLayer,
    writePersonalSqlEditorLayer,
} from '@sql-editor/settings/personal-storage'
import type {SqlEditorShortcutsLayer} from '@sql-editor/types'

/** 个人层 / 共享层读写适配，供设置控制器注入不同宿主存储。 */
export type SqlEditorShortcutsPersistence = {
    readPersonal(): SqlEditorShortcutsLayer
    writePersonal(layer: SqlEditorShortcutsLayer): void
    readShared?(): SqlEditorShortcutsLayer
    writeShared?(layer: SqlEditorShortcutsLayer): void
}

/** 仅个人层（编辑器内嵌抽屉默认）。 */
export function createPersonalSqlEditorPersistence(): SqlEditorShortcutsPersistence {
    return {
        readPersonal: readPersonalSqlEditorLayer,
        writePersonal: writePersonalSqlEditorLayer,
    }
}

export function persistenceHasShared(
    persistence: SqlEditorShortcutsPersistence,
): persistence is SqlEditorShortcutsPersistence & {
    readShared: () => SqlEditorShortcutsLayer
    writeShared: (layer: SqlEditorShortcutsLayer) => void
} {
    return typeof persistence.readShared === 'function' && typeof persistence.writeShared === 'function'
}
