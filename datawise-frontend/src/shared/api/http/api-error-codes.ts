/** 后端稳定错误码 → i18n key（与 GlobalExceptionHandler / UserPermissionPolicy 对齐）。 */
export const STABLE_API_ERROR_I18N: Record<string, string> = {
    UNAUTHORIZED: 'auth.unauthorized',
    INTERNAL_ERROR: 'auth.errors.INTERNAL_ERROR',
    BAD_REQUEST: 'auth.errors.BAD_REQUEST',
    SQL_EXECUTION_FAILED: 'auth.errors.SQL_EXECUTION_FAILED',
    SQL_QUERY_TIMEOUT: 'auth.errors.SQL_QUERY_TIMEOUT',
    SQL_CONCURRENCY_LIMIT: 'auth.errors.SQL_CONCURRENCY_LIMIT',
    SQL_SESSION_GONE: 'auth.errors.SQL_SESSION_GONE',
    SQL_CURSOR_GONE: 'auth.errors.SQL_CURSOR_GONE',
    TABLE_DATA_OFFSET_LIMIT: 'auth.errors.TABLE_DATA_OFFSET_LIMIT',
    IO_ERROR: 'auth.errors.IO_ERROR',
    JDBC_DRIVER_REQUIRED: 'auth.errors.JDBC_DRIVER_REQUIRED',
    JDBC_DRIVER_LOAD_FAILED: 'auth.errors.JDBC_DRIVER_LOAD_FAILED',
    JDBC_DRIVER_DOWNLOAD_FAILED: 'auth.errors.JDBC_DRIVER_DOWNLOAD_FAILED',
    DATABASE_CONNECTION_FAILED: 'auth.errors.DATABASE_CONNECTION_FAILED',
    DATASOURCE_NOT_AVAILABLE: 'auth.errors.DATASOURCE_NOT_AVAILABLE',
    DATASOURCE_TYPE_REQUIRED: 'auth.errors.DATASOURCE_TYPE_REQUIRED',
    FORBIDDEN: 'auth.permissionDenied',
    PERMISSION_DENIED: 'auth.permissionDenied',
    SQL_PRODUCTION_APPROVAL_REQUIRED: 'auth.errors.SQL_PRODUCTION_APPROVAL_REQUIRED',
    GUEST_NOT_ALLOWED: 'auth.guestNotAllowed',
    ADMIN_REQUIRED: 'auth.adminRequired',
    PLATFORM_ADMIN_REQUIRED: 'auth.platformAdminRequired',
    TENANCY_MULTI_REQUIRED: 'auth.errors.TENANCY_MULTI_REQUIRED',
    TENANT_ACCESS_DENIED: 'auth.errors.TENANT_ACCESS_DENIED',
    TENANT_NAME_REQUIRED: 'auth.errors.TENANT_NAME_REQUIRED',
    TENANT_SLUG_RESERVED: 'auth.errors.TENANT_SLUG_RESERVED',
    TENANT_SLUG_EXISTS: 'auth.errors.TENANT_SLUG_EXISTS',
    TENANT_SLUG_INVALID: 'auth.errors.TENANT_SLUG_INVALID',
    TENANT_ADMIN_NOT_FOUND: 'auth.errors.TENANT_ADMIN_NOT_FOUND',
    TENANT_ADMIN_GUEST_FORBIDDEN: 'auth.errors.TENANT_ADMIN_GUEST_FORBIDDEN',
    TENANT_STATUS_REQUIRED: 'auth.errors.TENANT_STATUS_REQUIRED',
    TENANT_STATUS_INVALID: 'auth.errors.TENANT_STATUS_INVALID',
    TENANT_DEFAULT_DELETE_FORBIDDEN: 'auth.errors.TENANT_DEFAULT_DELETE_FORBIDDEN',
    TENANT_REQUEST_REQUIRED: 'auth.errors.TENANT_REQUEST_REQUIRED',
    TENANT_GUEST_JOIN_FORBIDDEN: 'auth.errors.TENANT_GUEST_JOIN_FORBIDDEN',
    TENANT_NOT_FOUND: 'auth.errors.TENANT_NOT_FOUND',
    TENANT_MEMBERSHIP_NOT_FOUND: 'auth.errors.TENANT_MEMBERSHIP_NOT_FOUND',
    TENANT_LAST_ADMIN: 'auth.errors.TENANT_LAST_ADMIN',
    TENANT_SUSPENDED: 'auth.errors.TENANT_SUSPENDED',
    TENANT_DELETED: 'auth.errors.TENANT_DELETED',
    TENANT_USER_NOT_FOUND: 'auth.errors.TENANT_USER_NOT_FOUND',
    TENANT_USER_REQUIRED: 'auth.errors.TENANT_USER_REQUIRED',
    TENANT_ROLE_REQUIRED: 'auth.errors.TENANT_ROLE_REQUIRED',
    TENANT_ROLE_UNKNOWN: 'auth.errors.TENANT_ROLE_UNKNOWN',
    TENANT_CONNECTION_QUOTA_EXCEEDED: 'auth.errors.TENANT_CONNECTION_QUOTA_EXCEEDED',
    CONNECTION_QUOTA_EXCEEDED: 'auth.errors.CONNECTION_QUOTA_EXCEEDED',
    TENANT_AI_QUOTA_EXCEEDED: 'auth.errors.TENANT_AI_QUOTA_EXCEEDED',
    LICENSE_REQUIRED: 'pack.errors.LICENSE_REQUIRED',
    LICENSE_EXPIRED: 'pack.errors.LICENSE_EXPIRED',
    LICENSE_MISMATCH: 'pack.errors.LICENSE_MISMATCH',
    PACK_NOT_INSTALLED: 'pack.errors.PACK_NOT_INSTALLED',
    QUOTA_EXCEEDED: 'pack.errors.QUOTA_EXCEEDED',
    ROLE_KEY_INVALID: 'auth.errors.ROLE_KEY_INVALID',
    ROLE_KEY_EXISTS: 'auth.errors.ROLE_KEY_EXISTS',
    ROLE_SYSTEM_LOCKED: 'auth.errors.ROLE_SYSTEM_LOCKED',
    ROLE_IN_USE: 'auth.errors.ROLE_IN_USE',
    ROLE_NAME_REQUIRED: 'auth.errors.ROLE_NAME_REQUIRED',
    OIDC_TENANT_UNMAPPED: 'auth.errors.OIDC_TENANT_UNMAPPED',
    OIDC_TENANT_MEMBERSHIP_REQUIRED: 'auth.errors.OIDC_TENANT_MEMBERSHIP_REQUIRED',
    OIDC_ROLE_MISSING: 'auth.errors.OIDC_ROLE_MISSING',
    REGISTRATION_DISABLED: 'auth.registrationDisabled',
    USERNAME_TAKEN: 'auth.usernameTaken',
    PASSWORD_TOO_SHORT: 'auth.passwordTooShort',
    PASSWORD_UNCHANGED: 'profile.changePasswordUnchanged',
    PASSWORD_CHANGE_REQUIRED: 'profile.passwordChangeRequired',
    INVALID_CREDENTIALS: 'auth.invalidCredentials',
    INVALID_PASSWORD: 'auth.invalidPassword',
    PASSWORD_NOT_SET: 'auth.passwordNotSet',
    LOGIN_LOCKED: 'auth.loginLocked',
    LOCAL_LOGIN_DISABLED: 'auth.localLoginDisabled',
    GUEST_ROLES_UNSUPPORTED: 'auth.errors.GUEST_ROLES_UNSUPPORTED',
    ROLES_REQUIRED: 'auth.errors.ROLES_REQUIRED',
    INVALID_ROLE: 'auth.errors.INVALID_ROLE',
    CANNOT_MODIFY_ADMIN_PERMISSIONS: 'auth.errors.CANNOT_MODIFY_ADMIN',
    USER_NOT_FOUND: 'auth.errors.TENANT_USER_NOT_FOUND',
    CONNECTION_ACCESS_DENIED: 'auth.errors.CONNECTION_ACCESS_DENIED',
    API_TOKEN_FORBIDDEN: 'auth.errors.API_TOKEN_FORBIDDEN',
    HTTP_NOT_READY: 'auth.errors.HTTP_NOT_READY',
    HTTP_TIMEOUT: 'common.requestTimeout',
    HTTP_STATUS: 'auth.errors.HTTP_STATUS',
    DDL_NOT_SUPPORTED: 'auth.errors.DDL_NOT_SUPPORTED',
    FAKE_DATA_NOT_AVAILABLE: 'auth.errors.FAKE_DATA_NOT_AVAILABLE',
    MIGRATION_JOB_INVALID: 'auth.errors.MIGRATION_JOB_INVALID',
}

export function stableApiErrorI18nKey(code: string | undefined | null): string | null {
    if (!code?.trim()) return null
    const trimmed = code.trim()
    if (STABLE_API_ERROR_I18N[trimmed]) {
        return STABLE_API_ERROR_I18N[trimmed]
    }
    // 后端偶发 "unknown role: xxx"
    if (trimmed.startsWith('unknown role:')) {
        return STABLE_API_ERROR_I18N.TENANT_ROLE_UNKNOWN
    }
    // "DATASOURCE_NOT_AVAILABLE: mongodb" → 稳定码
    if (trimmed === 'DATASOURCE_NOT_AVAILABLE' || trimmed.startsWith('DATASOURCE_NOT_AVAILABLE:')) {
        return STABLE_API_ERROR_I18N.DATASOURCE_NOT_AVAILABLE
    }
    if (trimmed === 'DATASOURCE_TYPE_REQUIRED') {
        return STABLE_API_ERROR_I18N.DATASOURCE_TYPE_REQUIRED
    }
    if (trimmed === 'CONNECTION_ACCESS_DENIED' || trimmed.startsWith('CONNECTION_ACCESS_DENIED')) {
        return STABLE_API_ERROR_I18N.CONNECTION_ACCESS_DENIED
    }
    if (trimmed === 'API_TOKEN_FORBIDDEN') {
        return STABLE_API_ERROR_I18N.API_TOKEN_FORBIDDEN
    }
    if (
        trimmed === 'HTTP_NOT_READY'
        || trimmed.startsWith('HTTP API request failed')
    ) {
        return STABLE_API_ERROR_I18N.HTTP_NOT_READY
    }
    if (trimmed === 'HTTP_TIMEOUT') {
        return STABLE_API_ERROR_I18N.HTTP_TIMEOUT
    }
    if (/^HTTP \d{3}$/.test(trimmed)) {
        return STABLE_API_ERROR_I18N.HTTP_STATUS
    }
    if (
        /is not supported for dbType/i.test(trimmed)
        || /DDL is not supported for dbType/i.test(trimmed)
        || /CREATE (DATABASE|SCHEMA) is not supported/i.test(trimmed)
        || /DROP DATABASE is not supported/i.test(trimmed)
    ) {
        return STABLE_API_ERROR_I18N.DDL_NOT_SUPPORTED
    }
    if (/Fake data generation is not available/i.test(trimmed)) {
        return STABLE_API_ERROR_I18N.FAKE_DATA_NOT_AVAILABLE
    }
    if (
        /Migration (request changed|job already completed|job was cancelled)/i.test(trimmed)
    ) {
        return STABLE_API_ERROR_I18N.MIGRATION_JOB_INVALID
    }
    return null
}

/** 从 `DATASOURCE_NOT_AVAILABLE: mongodb` 解析展示名（如 MongoDB）。 */
export function parseDatasourceNotAvailableType(code: string | undefined | null): string | null {
    if (!code?.trim()) return null
    const match = /^DATASOURCE_NOT_AVAILABLE:\s*(.+)$/i.exec(code.trim())
    if (!match?.[1]) return null
    return formatDatasourceTypeLabel(match[1].trim())
}

const DATASOURCE_TYPE_LABELS: Record<string, string> = {
    mongodb: 'MongoDB',
    mysql: 'MySQL',
    mariadb: 'MariaDB',
    postgresql: 'PostgreSQL',
    postgres: 'PostgreSQL',
    sqlite: 'SQLite',
    sqlite3: 'SQLite',
    oracle: 'Oracle',
    sqlserver: 'SQL Server',
    mssql: 'SQL Server',
    clickhouse: 'ClickHouse',
    redis: 'Redis',
    kafka: 'Kafka',
    elasticsearch: 'Elasticsearch',
    hive: 'Hive',
    dm: '达梦',
    kingbase: '人大金仓',
    gaussdb: 'GaussDB',
    opengauss: 'openGauss',
    tidb: 'TiDB',
    oceanbase: 'OceanBase',
    starrocks: 'StarRocks',
    doris: 'Doris',
    trino: 'Trino',
    presto: 'Presto',
    kudu: 'Kudu',
    ssh: 'SSH',
}

function formatDatasourceTypeLabel(raw: string): string {
    const key = raw.trim().toLowerCase()
    if (DATASOURCE_TYPE_LABELS[key]) return DATASOURCE_TYPE_LABELS[key]
    if (!raw) return raw
    return raw.charAt(0).toUpperCase() + raw.slice(1)
}
