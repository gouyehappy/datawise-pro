import type {ConnectionConfig, DbType} from '@/core/types'
import type {DatasourceDefinition} from '@/features/datasource/types/datasource.types'
import {
    CONNECTION_AUTH_OPTIONS,
    CONNECTION_ENV_DEFAULT,
    CONNECTION_STORAGE_OPTIONS,
    DRIVER_PRESETS,
} from '../constants/connection-options'
import {DEFAULT_PORTS} from '../constants/db-types'
import {buildJdbcUrl} from './jdbc-url'

export function isUnsavedConnectionId(connectionId: string | undefined): boolean {
    return Boolean(connectionId?.trim().startsWith('new-'))
}

export function createDefaultConnection(
    dbType: DbType,
    catalogItem?: DatasourceDefinition | null,
): ConnectionConfig {
    const port = catalogItem?.defaultPort ?? DEFAULT_PORTS[dbType] ?? '3306'
    return {
        id: `new-${Date.now()}`,
        name: '',
        dbType,
        env: CONNECTION_ENV_DEFAULT,
        storage: CONNECTION_STORAGE_OPTIONS[0],
        host: 'localhost',
        port,
        auth: dbType === 'redis' || dbType === 'kafka' || dbType === 'kudu'
            ? CONNECTION_AUTH_OPTIONS[1]
            : dbType === 'kubernetes'
              ? 'token'
              : dbType === 'ssh'
                ? CONNECTION_AUTH_OPTIONS[0]
                : CONNECTION_AUTH_OPTIONS[0],
        user: dbType === 'redis' || dbType === 'kafka' || dbType === 'kudu' || dbType === 'kubernetes'
            ? ''
            : dbType === 'ssh'
              ? 'root'
              : dbType === 'sqlserver'
                ? 'sa'
                : dbType === 'nacos'
                  ? 'nacos'
                  : 'root',
        password: '',
        serviceType: dbType === 'oracle' ? 'SID' : undefined,
        sid: dbType === 'oracle' ? 'XE' : undefined,
        driver: catalogItem?.defaultDriverMaven ?? DRIVER_PRESETS[dbType]?.jar,
        driverClass: catalogItem?.defaultDriverClass ?? DRIVER_PRESETS[dbType]?.driverClass,
        database: '',
        writeGuard: false,
        sshEnabled: false,
        sshHost: '',
        sshPort: '22',
        sshUser: '',
        sshPassword: '',
        sshPrivateKey: '',
        sshPassphrase: '',
        jumpPrivateKey: '',
        jumpPassphrase: '',
        advancedConfig: dbType === 'kubernetes' ? 'insecureSkipTlsVerify=true\nuseHttps=true' : '',
        url: buildJdbcUrl(dbType, 'localhost', port, {sid: 'XE', database: ''}),
        pluginId: undefined,
        pluginConnectionProvider: undefined,
        pluginConnectionType: undefined,
    }
}

export function isJdbcDriverRequired(
    dbType: DbType,
    catalogItem?: DatasourceDefinition | null,
): boolean {
    if (catalogItem) return catalogItem.jdbcDriverRequired
    return dbType !== 'redis'
        && dbType !== 'kafka'
        && dbType !== 'mongodb'
        && dbType !== 'ssh'
        && dbType !== 'kudu'
        && dbType !== 'yarn'
        && dbType !== 'jenkins'
        && dbType !== 'nacos'
        && dbType !== 'polaris'
        && dbType !== 'kubernetes'
        && dbType !== 'plugin'
}
