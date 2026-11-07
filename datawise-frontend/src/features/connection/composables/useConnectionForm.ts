import {computed, onMounted, reactive, watch} from 'vue'
import type {ConnectionConfig, DbType} from '@/core/types'
import {DB_TYPE_LABELS} from '@/features/connection/constants/db-types'
import {createDefaultConnection} from '@/features/connection/utils/connection-defaults'
import {buildJdbcUrl} from '@/features/connection/utils/jdbc-url'
import {normalizeConnectionEnvironment} from '@/features/connection/services/connection-environment.service'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import {useProjectStore} from '@/features/project/stores/project'

/** 新建 / 编辑连接表单：默认值 + JDBC URL 自动同步 */
export function useConnectionForm(dbType: DbType) {
    const catalogStore = useDatasourceCatalogStore()
    const projectStore = useProjectStore()
    const form = reactive(createDefaultConnection(dbType))

    onMounted(() => {
        void catalogStore.ensureLoaded().then(() => {
            applyCatalogDefaults(dbType)
            applyProjectDefaultEnv()
        })
    })

    const label = computed(() => {
        const id = form.dbType ?? dbType
        return catalogStore.items.find((item) => item.id === id)?.label
            ?? DB_TYPE_LABELS[id as DbType]
            ?? id
    })

    function applyCatalogDefaults(type: DbType) {
        const item = catalogStore.items.find((entry) => entry.id === type)
        if (!item) return
        if (!form.port) form.port = item.defaultPort
        if (!form.driver && item.defaultDriverMaven) form.driver = item.defaultDriverMaven
        if (!form.driverClass && item.defaultDriverClass) form.driverClass = item.defaultDriverClass
    }

    function applyProjectDefaultEnv() {
        const projectEnv = projectStore.activeProject?.defaultEnv?.trim()
        if (!projectEnv) return
        const normalized = normalizeConnectionEnvironment(projectEnv)
        form.env = normalized.env
        form.envCustom = normalized.envCustom
    }

    watch(
        () => [form.host, form.port, form.sid, form.database, form.user, form.auth, form.advancedConfig] as const,
        () => {
            form.url = buildJdbcUrl(form.dbType ?? dbType, form.host, form.port, {
                sid: form.sid,
                database: form.database,
                user: form.user,
                auth: form.auth,
                advancedConfig: form.advancedConfig,
            })
        },
        {immediate: true},
    )

    function applyConfig(config: ConnectionConfig) {
        const resolvedType = (config.dbType ?? dbType) as DbType
        const item = catalogStore.items.find((entry) => entry.id === resolvedType)
        const normalizedEnv = normalizeConnectionEnvironment(config.env, config.envCustom)
        Object.assign(form, createDefaultConnection(resolvedType, item), config, {
            dbType: resolvedType,
            password: config.password ?? '',
            env: normalizedEnv.env,
            envCustom: normalizedEnv.envCustom,
        })
    }

    function getPayload(): ConnectionConfig {
        const normalizedEnv = normalizeConnectionEnvironment(form.env, form.envCustom)
        return {
            ...form,
            env: normalizedEnv.env,
            envCustom: normalizedEnv.envCustom,
        }
    }

    return {form, label, getPayload, applyConfig}
}
