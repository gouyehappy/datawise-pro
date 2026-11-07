import {computed, unref, type MaybeRef} from 'vue'
import {useI18n} from 'vue-i18n'
import {useContextMenu} from '@/core/context-menu'
import type {DbType} from '@/core/types'
import {
    buildSessionSqlContextMenuItems,
    type SessionSqlMenuAction,
} from '@/features/workspace/constants/session-sql-context-menu'
import {openMonitorSessionSql} from '@/features/workspace/services/session-monitor-sql.actions'
import {useConnectionCapabilities} from '@/features/datasource/composables/useConnectionCapabilities'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'

export function useMonitorSessionSqlMenu(options: {
    connectionId: MaybeRef<string | undefined>
    database: MaybeRef<string | undefined>
    dbType: MaybeRef<DbType | undefined>
}) {
    const {t} = useI18n()
    const menu = useContextMenu<string>()
    const pluginStore = usePluginStore()
    const {caps, hint} = useConnectionCapabilities(options.dbType)

    const explainPlanEnabled = computed(() => pluginStore.isEnabled('p-explain-plan'))

    const menuItems = computed(() =>
        buildSessionSqlContextMenuItems(t, {
            hasSql: Boolean(menu.target.value?.trim()),
            explainSupported: explainPlanEnabled.value && caps.value.sqlExplain,
            explainDisabledHint: hint('sqlExplain'),
        }),
    )

    function onContextMenu(event: MouseEvent, sql: string) {
        event.preventDefault()
        event.stopPropagation()
        const trimmed = sql.trim()
        menu.open(
            event,
            buildSessionSqlContextMenuItems(t, {
                hasSql: Boolean(trimmed),
                explainSupported: explainPlanEnabled.value && caps.value.sqlExplain,
                explainDisabledHint: hint('sqlExplain'),
            }),
            sql,
        )
    }

    async function onMenuSelect(id: string) {
        const sql = menu.target.value ?? ''
        const action = id as SessionSqlMenuAction
        menu.close()
        if (action !== 'open-sql' && action !== 'view-plan') return
        await openMonitorSessionSql({
            sql,
            mode: action === 'view-plan' ? 'explain' : 'open',
            connectionId: unref(options.connectionId),
            database: unref(options.database),
            dbType: unref(options.dbType),
        })
    }

    return {
        menuVisible: menu.visible,
        menuPos: menu.pos,
        menuItems,
        onContextMenu,
        onMenuSelect,
        closeMenu: menu.close,
    }
}
