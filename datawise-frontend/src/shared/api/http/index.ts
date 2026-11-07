import type {ApiClient} from '@/shared/api/types'
import {createHttpAuthApi} from '@/shared/api/http/auth'
import {createHttpSqlApi} from '@/shared/api/http/sql'
import {createHttpAiApi} from '@/shared/api/http/ai'
import {createHttpTableDataApi} from '@/shared/api/http/table-data'
import {createHttpTableDetailApi} from '@/shared/api/http/table-detail'
import {createHttpConnectionApi} from '@/shared/api/http/connection'
import {createHttpTerminalApi} from '@/shared/api/http/terminal'
import {createHttpExplorerApi} from '@/shared/api/http/explorer'
import {createHttpWorkspaceApi} from '@/shared/api/http/workspace'
import {createHttpNotificationApi} from '@/shared/api/http/notifications'
import {createHttpPluginApi} from '@/shared/api/http/plugins'
import {createHttpPacksApi} from '@/shared/api/http/packs'
import {createHttpTeamApi} from '@/shared/api/http/teams'
import {createHttpSystemApi} from '@/shared/api/http/system'
import {createHttpConfigApi} from '@/shared/api/http/config'
import {createHttpDatasourcesApi} from '@/shared/api/http/datasources'
import {createHttpRuntimeApi} from '@/shared/api/http/runtime'
import {createHttpMigrationApi} from '@/shared/api/http/migration'
import {createHttpPlatformApi} from '@/shared/api/http/platform'
import {createHttpLineageApi} from '@/shared/api/http/lineage'
import {createHttpDatagenApi} from '@/shared/api/http/datagen'
import {createHttpUserAdminApi} from '@/shared/api/http/user-admin'

/** HTTP 实现：按域组装，路径见 http/paths.ts */
export function createHttpApiClient(): ApiClient {
    return {
        auth: createHttpAuthApi(),
        userAdmin: createHttpUserAdminApi(),
        sql: createHttpSqlApi(),
        ai: createHttpAiApi(),
        datagen: createHttpDatagenApi(),
        tableData: createHttpTableDataApi(),
        tableDetail: createHttpTableDetailApi(),
        connection: createHttpConnectionApi(),
        terminal: createHttpTerminalApi(),
        explorer: createHttpExplorerApi(),
        workspace: createHttpWorkspaceApi(),
        notifications: createHttpNotificationApi(),
        plugins: createHttpPluginApi(),
        packs: createHttpPacksApi(),
        teams: createHttpTeamApi(),
        system: createHttpSystemApi(),
        config: createHttpConfigApi(),
        datasources: createHttpDatasourcesApi(),
        runtime: createHttpRuntimeApi(),
        migration: createHttpMigrationApi(),
        platform: createHttpPlatformApi(),
        lineage: createHttpLineageApi(),
    }
}

export {API_PATHS} from '@/shared/api/http/paths'
