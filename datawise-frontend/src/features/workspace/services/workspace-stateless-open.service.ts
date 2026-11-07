/**
 * Pure find/reuse + create-payload helpers for stateless connector workspace tabs.
 * Store methods apply mutations (tabs / activeTabId / touch) after these decisions.
 */
import type {WorkspaceTab, WorkspaceTabType} from '@/core/types'
import {t} from '@/i18n'

export type StatelessOpenReuse = {
    reuse: WorkspaceTab
    patches?: Partial<WorkspaceTab>
}

export type StatelessOpenCreate = {
    create: Partial<WorkspaceTab> & {
        type: WorkspaceTabType
        title: string
        closable: true
    }
}

export type StatelessOpenDecision = StatelessOpenReuse | StatelessOpenCreate

export type ConnectionOpenBase = {
    connectionId: string
    /** Resolved display label (connectionName ?? explorer/data-source label). */
    connectionLabel?: string
    explorerNodeId?: string
}

function labeledTitle(
    label: string | undefined,
    tabTitleKey: string,
    plainTitleKey: string,
): string {
    return label ? t(tabTitleKey, {name: label}) : t(plainTitleKey)
}

function findByTypeAndConnection(
    tabs: WorkspaceTab[],
    type: WorkspaceTabType,
    connectionId: string,
): WorkspaceTab | undefined {
    return tabs.find((tab) => tab.type === type && tab.connectionId === connectionId)
}

// --- Redis ---

export function planOpenRedisKey(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase & {key: string},
): StatelessOpenDecision {
    const existing = tabs.find(
        (tab) =>
            tab.type === 'redis-key'
            && tab.connectionId === options.connectionId
            && tab.params?.redisKey === options.key,
    )
    if (existing) return {reuse: existing}

    return {
        create: {
            title: options.key,
            type: 'redis-key',
            closable: true,
            connectionId: options.connectionId,
            dbType: 'redis',
            explorerNodeId: options.explorerNodeId,
            params: {redisKey: options.key},
        },
    }
}

export function planOpenRedisConsole(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase & {view?: 'keys' | 'command'},
): StatelessOpenDecision {
    const view = options.view ?? 'keys'
    const existing = findByTypeAndConnection(tabs, 'redis-console', options.connectionId)
    if (existing) {
        return {reuse: existing, patches: {params: {redisView: view}}}
    }

    return {
        create: {
            title: labeledTitle(
                options.connectionLabel,
                'explorer.redisConsole.tabTitle',
                'explorer.redisConsole.title',
            ),
            type: 'redis-console',
            closable: true,
            connectionId: options.connectionId,
            dbType: 'redis',
            explorerNodeId: options.explorerNodeId,
            params: {redisView: view},
        },
    }
}

// --- Mongo ---

export function planOpenMongoConsole(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase & {database?: string; collectionName?: string},
): StatelessOpenDecision {
    const existing = tabs.find(
        (tab) =>
            tab.type === 'mongo-console'
            && tab.connectionId === options.connectionId
            && (options.database ? tab.database === options.database : true),
    )
    if (existing) {
        const patches: Partial<WorkspaceTab> = {}
        if (options.database) patches.database = options.database
        if (options.collectionName) patches.tableName = options.collectionName
        if (options.explorerNodeId) patches.explorerNodeId = options.explorerNodeId
        if (options.collectionName) {
            patches.title = options.collectionName
        } else if (options.database) {
            patches.title = options.database
        }
        return {reuse: existing, patches: Object.keys(patches).length ? patches : undefined}
    }

    const title = options.collectionName
        ?? options.database
        ?? labeledTitle(
            options.connectionLabel,
            'explorer.mongoConsole.tabTitle',
            'explorer.mongoConsole.title',
        )

    return {
        create: {
            title,
            type: 'mongo-console',
            closable: true,
            connectionId: options.connectionId,
            database: options.database,
            tableName: options.collectionName,
            dbType: 'mongodb',
            explorerNodeId: options.explorerNodeId,
        },
    }
}

// --- Kafka ---

export function planOpenKafkaTopics(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase & {topic?: string},
): StatelessOpenDecision {
    const existing = findByTypeAndConnection(tabs, 'kafka-topics', options.connectionId)
    if (existing) {
        return {
            reuse: existing,
            patches: options.topic ? {params: {kafkaTopic: options.topic}} : undefined,
        }
    }

    return {
        create: {
            title: labeledTitle(
                options.connectionLabel,
                'explorer.kafkaConsole.tabTitle',
                'explorer.kafkaConsole.title',
            ),
            type: 'kafka-topics',
            closable: true,
            connectionId: options.connectionId,
            dbType: 'kafka',
            explorerNodeId: options.explorerNodeId,
            params: options.topic ? {kafkaTopic: options.topic} : undefined,
        },
    }
}

export function planOpenKafkaConsumerGroups(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase & {topic?: string},
): StatelessOpenDecision {
    const existing = findByTypeAndConnection(tabs, 'kafka-consumer-groups', options.connectionId)
    if (existing) {
        return {
            reuse: existing,
            patches: options.topic ? {params: {kafkaTopic: options.topic}} : undefined,
        }
    }

    return {
        create: {
            title: labeledTitle(
                options.connectionLabel,
                'explorer.kafkaConsumerGroups.tabTitle',
                'explorer.kafkaConsumerGroups.title',
            ),
            type: 'kafka-consumer-groups',
            closable: true,
            connectionId: options.connectionId,
            dbType: 'kafka',
            explorerNodeId: options.explorerNodeId,
            params: options.topic ? {kafkaTopic: options.topic} : undefined,
        },
    }
}

export function planOpenKafkaTablePublish(
    tabs: WorkspaceTab[],
    options: {
        kafkaConnectionId?: string
        kafkaConnectionLabel?: string
        explorerNodeId?: string
        lockKafkaConnection?: boolean
        source?: {
            connectionId: string
            connectionLabel?: string
            database: string
            tableName: string
        }
    },
): StatelessOpenDecision {
    const source = options.source
    const kafkaId = options.kafkaConnectionId

    const existing = tabs.find((tab) => {
        if (tab.type !== 'kafka-table-publish') return false
        if (source) {
            return tab.params?.kafkaPublishSourceConnectionId === source.connectionId
                && tab.database === source.database
                && tab.tableName === source.tableName
        }
        if (kafkaId) {
            return tab.connectionId === kafkaId && !tab.params?.kafkaPublishSourceConnectionId
        }
        return false
    })

    if (existing) {
        const patches: Partial<WorkspaceTab> = {}
        if (kafkaId) patches.connectionId = kafkaId
        if (options.lockKafkaConnection) {
            patches.params = {kafkaPublishLockConnection: true}
        }
        return {reuse: existing, patches: Object.keys(patches).length ? patches : undefined}
    }

    const title = source?.tableName
        ? t('explorer.kafkaTablePublish.tabTitleTable', {table: source.tableName})
        : options.kafkaConnectionLabel
            ? t('explorer.kafkaTablePublish.tabTitle', {name: options.kafkaConnectionLabel})
            : t('explorer.kafkaTablePublish.title')

    return {
        create: {
            title,
            type: 'kafka-table-publish',
            closable: true,
            connectionId: kafkaId,
            dbType: 'kafka',
            explorerNodeId: options.explorerNodeId,
            params: {
                kafkaPublishSourceConnectionId: source?.connectionId,
                kafkaPublishLockConnection: options.lockKafkaConnection ?? false,
            },
            database: source?.database,
            tableName: source?.tableName,
        },
    }
}

// --- SSH ---

export function planOpenSshTerminal(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase,
): StatelessOpenCreate {
    const existingCount = tabs.filter(
        (tab) => tab.type === 'ssh-terminal' && tab.connectionId === options.connectionId,
    ).length
    const sessionIndex = existingCount + 1
    const baseTitle = options.connectionLabel
        ? t('terminal.sshTabTitle', {name: options.connectionLabel})
        : t('terminal.sshTitle')
    const title = sessionIndex > 1 ? `${baseTitle} #${sessionIndex}` : baseTitle

    return {
        create: {
            title,
            type: 'ssh-terminal',
            closable: true,
            connectionId: options.connectionId,
            dbType: 'ssh',
            explorerNodeId: options.explorerNodeId,
            sshTerminalIndex: sessionIndex,
        },
    }
}

export function planOpenSshScriptRecord(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase & {
        recordId: string
        title: string
        contentHtml?: string
        updatedAt?: number
    },
): StatelessOpenDecision {
    const existing = tabs.find(
        (tab) =>
            tab.type === 'ssh-script-record'
            && tab.connectionId === options.connectionId
            && tab.sshScriptRecordId === options.recordId,
    )
    if (existing) return {reuse: existing}

    return {
        create: {
            title: options.title,
            type: 'ssh-script-record',
            closable: true,
            connectionId: options.connectionId,
            dbType: 'ssh',
            explorerNodeId: options.explorerNodeId,
            sshScriptRecordId: options.recordId,
            sshScriptRecordTitle: options.title,
            sshScriptRecordHtml: options.contentHtml ?? '',
            sshScriptRecordUpdatedAt: options.updatedAt,
        },
    }
}

/** Apply optional patches onto a reused tab (mutates in place). Merges `params`. */
export function applyStatelessOpenPatches(
    tab: WorkspaceTab,
    patches?: Partial<WorkspaceTab>,
): void {
    if (!patches) return
    const {params, ...rest} = patches
    Object.assign(tab, rest)
    if (params) {
        tab.params = {...tab.params, ...params}
    }
}
