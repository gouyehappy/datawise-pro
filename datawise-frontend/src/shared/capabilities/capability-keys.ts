/** 与后端 {@code ConnectorCapability} 枚举名一致 */
export const CONNECTOR_CAPABILITY = {
    CONNECTION_TEST: 'CONNECTION_TEST',
    CATALOG: 'CATALOG',
    METADATA: 'METADATA',
    DDL_READ: 'DDL_READ',
    DDL_RENDER: 'DDL_RENDER',
    DDL_TRANSLATE: 'DDL_TRANSLATE',
    SQL_EXECUTE: 'SQL_EXECUTE',
    SQL_EXPLAIN: 'SQL_EXPLAIN',
    DML: 'DML',
    SESSION_MONITOR: 'SESSION_MONITOR',
    SESSION_KILL: 'SESSION_KILL',
    LOCK_MONITOR: 'LOCK_MONITOR',
    ONLINE_DDL: 'ONLINE_DDL',
    SSH_TUNNEL: 'SSH_TUNNEL',
    NATIVE_COMMAND: 'NATIVE_COMMAND',
    KEY_VALUE: 'KEY_VALUE',
    MESSAGE_BROKER: 'MESSAGE_BROKER',
    DOCUMENT_READ: 'DOCUMENT_READ',
    CLUSTER_MANAGER: 'CLUSTER_MANAGER',
    CI_CD: 'CI_CD',
    KUBERNETES: 'KUBERNETES',
    REMOTE_SHELL: 'REMOTE_SHELL',
} as const

export type ConnectorCapabilityName = (typeof CONNECTOR_CAPABILITY)[keyof typeof CONNECTOR_CAPABILITY]

export type CapabilityHintKey =
    | 'sqlExplain'
    | 'sessionMonitor'
    | 'sessionKill'
    | 'lockMonitor'
    | 'onlineDdl'
    | 'sshTunnel'
    | 'sqlExecute'
    | 'tableMutation'
    | 'csvImport'
    | 'diagram'
    | 'visualQueryBuilder'
    | 'schemaCompare'
    | 'transactionalDdl'

export const CAPABILITY_HINT_I18N: Record<CapabilityHintKey, string> = {
    sqlExplain: 'capabilities.unsupported.sqlExplain',
    sessionMonitor: 'capabilities.unsupported.sessionMonitor',
    sessionKill: 'capabilities.unsupported.sessionKill',
    lockMonitor: 'capabilities.unsupported.lockMonitor',
    onlineDdl: 'capabilities.unsupported.onlineDdl',
    sshTunnel: 'capabilities.unsupported.sshTunnel',
    sqlExecute: 'capabilities.unsupported.sqlExecute',
    tableMutation: 'capabilities.unsupported.tableMutation',
    csvImport: 'capabilities.unsupported.csvImport',
    diagram: 'capabilities.unsupported.diagram',
    visualQueryBuilder: 'capabilities.unsupported.visualQueryBuilder',
    schemaCompare: 'capabilities.unsupported.schemaCompare',
    transactionalDdl: 'capabilities.unsupported.transactionalDdl',
}
