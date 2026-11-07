import type {SshCommandItem, SshScriptRecord} from '@/features/ssh/types/ssh-script-record.types'
import {createSshCommandItem} from '@/features/ssh/types/ssh-script-record.types'
import {
    hasStructuredCommands,
    hydrateSshScriptRecord,
    isBuiltInScriptRecordId,
    serializeCommandEntries,
} from '@/features/ssh/services/ssh-my-commands.service'
import {t} from '@/i18n'

type BuiltinCmdDef = {
    id: string
    command: string
    mode: 'run' | 'paste'
    hasDescription?: boolean
}

type BuiltinDef = {
    commands: BuiltinCmdDef[]
}

/** One-shot host inspection; sections stay in the current terminal. */
const FULL_INSPECTION_COMMAND = [
    "echo '=== host ==='; hostname; uname -a",
    "echo '=== uptime ==='; uptime",
    "echo '=== disk ==='; df -hT",
    "echo '=== inode ==='; df -i",
    "echo '=== memory ==='; free -h 2>/dev/null || vm_stat",
    "echo '=== load ==='; top -b -n 1 2>/dev/null | head -n 25 || top -l 1 2>/dev/null | head -n 25",
    "echo '=== cpu ==='; ps aux --sort=-%cpu 2>/dev/null | head -n 15 || ps aux | head -n 15",
    "echo '=== mem ==='; ps aux --sort=-%mem 2>/dev/null | head -n 15 || ps aux | head -n 15",
    "echo '=== ports ==='; ss -tlnp 2>/dev/null | head -n 30 || netstat -tlnp 2>/dev/null | head -n 30",
    "echo '=== failed ==='; systemctl --failed 2>/dev/null || true",
].join('; ')

/** Stable ids only — titles/descriptions come from ssh.builtins.* at resolve time. */
const BUILTIN_DEFS: Record<string, BuiltinDef> = {
    'builtin-common': {
        commands: [
            {id: 'currentUser', command: 'whoami; id', mode: 'run', hasDescription: true},
            {id: 'hostInfo', command: 'hostname; uname -a', mode: 'run', hasDescription: true},
            {id: 'now', command: 'date; timedatectl 2>/dev/null | head -n 8', mode: 'run'},
            {
                id: 'dirUsage',
                command: 'du -h --max-depth=1 2>/dev/null | sort -hr | head -n 20',
                mode: 'run',
            },
            {
                id: 'largeFiles',
                command: 'find / -xdev -type f -size +500M 2>/dev/null | head -n 30',
                mode: 'paste',
            },
            {id: 'netAddrs', command: 'ip -br a 2>/dev/null || ifconfig', mode: 'run'},
            {id: 'routes', command: 'ip route 2>/dev/null || route -n', mode: 'run'},
            {id: 'env', command: 'env | sort | head -n 40', mode: 'run'},
        ],
    },
    'builtin-logs': {
        commands: [
            {
                id: 'recent',
                command: 'journalctl -n 80 --no-pager 2>/dev/null || tail -n 80 /var/log/messages 2>/dev/null || tail -n 80 /var/log/syslog',
                mode: 'run',
            },
            {
                id: 'errors',
                command: "journalctl -p err -n 50 --no-pager 2>/dev/null || grep -iE 'error|exception|fail' /var/log/messages 2>/dev/null | tail -n 50",
                mode: 'run',
            },
            {id: 'logDir', command: 'ls -lt /var/log 2>/dev/null | head -n 20', mode: 'run'},
            {
                id: 'followSyslog',
                command: 'journalctl -f --no-pager 2>/dev/null || tail -f /var/log/messages 2>/dev/null || tail -f /var/log/syslog',
                mode: 'paste',
                hasDescription: true,
            },
        ],
    },
    'builtin-status': {
        commands: [
            {id: 'fullInspection', command: FULL_INSPECTION_COMMAND, mode: 'run', hasDescription: true},
            {id: 'uptime', command: 'uptime', mode: 'run'},
            {id: 'disk', command: 'df -hT', mode: 'run'},
            {id: 'inode', command: 'df -i', mode: 'run'},
            {id: 'memory', command: 'free -h 2>/dev/null || vm_stat', mode: 'run'},
            {
                id: 'loadTop',
                command: 'top -b -n 1 2>/dev/null | head -n 25 || top -l 1 2>/dev/null | head -n 25',
                mode: 'run',
            },
            {
                id: 'procCpu',
                command: 'ps aux --sort=-%cpu 2>/dev/null | head -n 20 || ps aux | head -n 20',
                mode: 'run',
            },
            {
                id: 'procMem',
                command: 'ps aux --sort=-%mem 2>/dev/null | head -n 20 || ps aux | head -n 20',
                mode: 'run',
            },
            {
                id: 'ports',
                command: 'ss -tlnp 2>/dev/null | head -n 30 || netstat -tlnp 2>/dev/null | head -n 30',
                mode: 'run',
            },
            {id: 'failedServices', command: 'systemctl --failed 2>/dev/null || true', mode: 'run'},
        ],
    },
    'builtin-yarn': {
        commands: [
            {id: 'appList', command: 'yarn application -list', mode: 'paste'},
            {id: 'runningApps', command: 'yarn application -list -appStates RUNNING', mode: 'paste'},
            {id: 'appStatus', command: 'yarn application -status {{appId}}', mode: 'paste'},
            {
                id: 'appLogs',
                command: 'yarn logs -applicationId {{appId}} 2>/dev/null | tail -n 200',
                mode: 'paste',
            },
            {id: 'killApp', command: 'yarn application -kill {{appId}}', mode: 'paste'},
            {id: 'nodeList', command: 'yarn node -list -all', mode: 'paste'},
            {
                id: 'queues',
                command: 'yarn queue -list 2>/dev/null || yarn scheduler -showJobs 2>/dev/null || true',
                mode: 'paste',
            },
            {id: 'clusterMetrics', command: 'yarn top 2>/dev/null || yarn node -list', mode: 'paste'},
            {
                id: 'rmState',
                command: 'yarn rmadmin -getServiceState rm 2>/dev/null || curl -s http://localhost:8088/ws/v1/cluster/info 2>/dev/null | head -c 800',
                mode: 'paste',
            },
        ],
    },
    'builtin-kafka': {
        commands: [
            {
                id: 'topicList',
                command: 'kafka-topics.sh --bootstrap-server localhost:9092 --list 2>/dev/null || kafka-topics --bootstrap-server localhost:9092 --list',
                mode: 'paste',
            },
            {
                id: 'describeTopic',
                command: 'kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic {{topic}} 2>/dev/null || kafka-topics --bootstrap-server localhost:9092 --describe --topic {{topic}}',
                mode: 'paste',
            },
            {
                id: 'groupList',
                command: 'kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list 2>/dev/null || kafka-consumer-groups --bootstrap-server localhost:9092 --list',
                mode: 'paste',
            },
            {
                id: 'groupDetail',
                command: 'kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group {{groupId}} 2>/dev/null || kafka-consumer-groups --bootstrap-server localhost:9092 --describe --group {{groupId}}',
                mode: 'paste',
            },
            {
                id: 'consume',
                command: 'kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic {{topic}} --from-beginning --max-messages 20 2>/dev/null || kafka-console-consumer --bootstrap-server localhost:9092 --topic {{topic}} --from-beginning --max-messages 20',
                mode: 'paste',
            },
            {
                id: 'produce',
                command: 'kafka-console-producer.sh --bootstrap-server localhost:9092 --topic {{topic}} 2>/dev/null || kafka-console-producer --bootstrap-server localhost:9092 --topic {{topic}}',
                mode: 'paste',
                hasDescription: true,
            },
            {
                id: 'topicConfig',
                command: 'kafka-configs.sh --bootstrap-server localhost:9092 --entity-type topics --entity-name {{topic}} --describe 2>/dev/null || kafka-configs --bootstrap-server localhost:9092 --entity-type topics --entity-name {{topic}} --describe',
                mode: 'paste',
            },
        ],
    },
    'builtin-mongodb': {
        commands: [
            {
                id: 'dbList',
                command: 'mongosh --quiet --eval \'db.adminCommand({ listDatabases: 1 }).databases.map(d => d.name).join("\\n")\' 2>/dev/null || mongo --quiet --eval \'db.adminCommand({ listDatabases: 1 }).databases.forEach(d => print(d.name))\'',
                mode: 'paste',
            },
            {
                id: 'collections',
                command: 'mongosh {{db}} --quiet --eval \'db.getCollectionNames().join("\\n")\' 2>/dev/null || mongo {{db}} --quiet --eval \'db.getCollectionNames().forEach(printjson)\'',
                mode: 'paste',
            },
            {
                id: 'sampleQuery',
                command: 'mongosh {{db}} --quiet --eval \'db.getCollection("{{collection}}").find().limit(10).toArray()\' 2>/dev/null || mongo {{db}} --quiet --eval \'db.getCollection("{{collection}}").find().limit(10).forEach(printjson)\'',
                mode: 'paste',
            },
            {
                id: 'collStats',
                command: 'mongosh {{db}} --quiet --eval \'printjson(db.getCollection("{{collection}}").stats())\' 2>/dev/null || mongo {{db}} --quiet --eval \'printjson(db.getCollection("{{collection}}").stats())\'',
                mode: 'paste',
            },
            {
                id: 'indexes',
                command: 'mongosh {{db}} --quiet --eval \'printjson(db.getCollection("{{collection}}").getIndexes())\' 2>/dev/null || mongo {{db}} --quiet --eval \'printjson(db.getCollection("{{collection}}").getIndexes())\'',
                mode: 'paste',
            },
            {
                id: 'serverStatus',
                command: 'mongosh --quiet --eval \'printjson(db.serverStatus())\' 2>/dev/null || mongo --quiet --eval \'printjson(db.serverStatus())\'',
                mode: 'paste',
            },
            {
                id: 'replStatus',
                command: 'mongosh --quiet --eval \'try { printjson(rs.status()) } catch (e) { print(e) }\' 2>/dev/null || mongo --quiet --eval \'try { printjson(rs.status()) } catch(e) { print(e) }\'',
                mode: 'paste',
            },
        ],
    },
}

function localizeBuiltin(recordId: string): {title: string; commands: SshCommandItem[]} | null {
    const def = BUILTIN_DEFS[recordId]
    if (!def) return null
    const ns = `ssh.builtins.${recordId}`
    return {
        title: t(`${ns}.title`),
        commands: def.commands.map((item) => createSshCommandItem({
            title: t(`${ns}.cmds.${item.id}.title`),
            command: item.command,
            mode: item.mode,
            description: item.hasDescription ? t(`${ns}.cmds.${item.id}.desc`) : undefined,
        })),
    }
}

export function resolveBuiltinCommandPlainText(recordId: string): string | null {
    const builtin = localizeBuiltin(recordId)
    if (!builtin) return null
    return serializeCommandEntries(builtin.commands)
}

export function resolveBuiltinCommands(recordId: string): SshCommandItem[] | null {
    return localizeBuiltin(recordId)?.commands ?? null
}

/** Repair blank built-in records and hydrate legacy DSL into structured commands. */
export function repairSshScriptRecords(records: SshScriptRecord[]): SshScriptRecord[] {
    const repaired = records.map((record) => {
        let next = record
        if (isBuiltInScriptRecordId(record.id)
            && !hasStructuredCommands(record)
            && !record.contentHtml?.trim()) {
            const builtin = localizeBuiltin(record.id)
            if (builtin) {
                next = {
                    ...record,
                    title: record.title?.trim() || builtin.title,
                    commands: builtin.commands,
                    contentHtml: serializeCommandEntries(builtin.commands),
                }
            }
        } else if (isBuiltInScriptRecordId(record.id)) {
            // Keep persisted title; only fill blank titles from the current locale.
            const builtin = localizeBuiltin(record.id)
            if (builtin && !record.title?.trim()) {
                next = {...record, title: builtin.title}
            }
        }
        next = hydrateSshScriptRecord(next)
        return appendMissingInspection(next)
    })

    const present = new Set(repaired.map((item) => item.id))
    const missing: SshScriptRecord[] = []
    for (const id of Object.keys(BUILTIN_DEFS)) {
        if (present.has(id)) continue
        const builtin = localizeBuiltin(id)
        if (!builtin) continue
        missing.push({
            id,
            title: builtin.title,
            commands: builtin.commands,
            contentHtml: serializeCommandEntries(builtin.commands),
            updatedAt: Date.now(),
        })
    }
    return missing.length ? [...repaired, ...missing] : repaired
}

/** Prepend the stock inspection command when a structured status record does not have it yet. */
function appendMissingInspection(record: SshScriptRecord): SshScriptRecord {
    if (record.id !== 'builtin-status' || !hasStructuredCommands(record)) {
        return record
    }
    const blob = (record.commands ?? []).map((item) => item.command).join('\n')
    if (blob.includes("=== host ===")) {
        return record
    }
    const inspection = localizeBuiltin('builtin-status')?.commands.find((item) => item.command.includes("=== host ==="))
    if (!inspection) {
        return record
    }
    const commands = [inspection, ...(record.commands ?? [])]
    return {
        ...record,
        commands,
        contentHtml: serializeCommandEntries(commands),
    }
}
