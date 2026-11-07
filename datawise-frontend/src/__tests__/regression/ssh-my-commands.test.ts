import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {htmlToPlainText} from '@/features/ssh/services/ssh-html-text.service'
import {
    commandsToExecutableText,
    filterMyCommandGroups,
    hydrateSshScriptRecord,
    isBuiltInScriptRecordId,
    parseCommandEntries,
    parseMyCommandGroups,
    resolveRecordCommands,
    serializeCommandEntries,
    sortMyCommandGroups,
    summarizeCommandLabel,
} from '@/features/ssh/services/ssh-my-commands.service'
import {createSshCommandItem} from '@/features/ssh/types/ssh-script-record.types'

describe('ssh-html-text.service', () => {
    it('preserves line breaks from paragraph html', () => {
        const text = htmlToPlainText('<p># 服务器地址</p><p>51</p><p>yarn application -list</p>')
        assert.ok(text.includes('\n'))
        assert.ok(text.includes('# 服务器地址'))
        assert.ok(text.includes('yarn application -list'))
    })
})

describe('ssh-my-commands.service', () => {
    it('parses hash labels with following command lines', () => {
        const parsed = parseCommandEntries(`# 服务器地址
51
# 查看应用列表
yarn application -list`)
        assert.equal(parsed.entries.length, 2)
        assert.equal(parsed.entries[0]?.label, '服务器地址')
        assert.equal(parsed.entries[0]?.command, '51')
        assert.equal(parsed.entries[1]?.label, '查看应用列表')
        assert.equal(parsed.entries[1]?.command, 'yarn application -list')
        assert.equal(parsed.mode, 'paste')
        assert.equal(parsed.commands[0]?.title, '服务器地址')
        assert.equal(parsed.commands[0]?.mode, 'paste')
    })

    it('parses @run mode and entry-level overrides', () => {
        const parsed = parseCommandEntries(`@run
# 磁盘
df -h
# 自定义 !paste
echo hello`)
        assert.equal(parsed.mode, 'run')
        assert.equal(parsed.entries[0]?.command, 'df -h')
        assert.equal(parsed.commands[0]?.mode, 'run')
        assert.equal(parsed.entries[1]?.mode, 'paste')
        assert.equal(parsed.commands[1]?.mode, 'paste')
    })

    it('applies sectional @paste then @run modes to following commands', () => {
        const parsed = parseCommandEntries(`@paste
# 服务
192.0.2.53
@run
# 启动
trino --server localhost:18080
# 查看catalog
show catalogs;`)
        assert.equal(parsed.commands.length, 3)
        assert.equal(parsed.commands[0]?.mode, 'paste')
        assert.equal(parsed.commands[0]?.title, '服务')
        assert.equal(parsed.commands[1]?.mode, 'run')
        assert.equal(parsed.commands[1]?.title, '启动')
        assert.equal(parsed.commands[2]?.mode, 'run')
        assert.equal(parsed.commands[2]?.title, '查看catalog')
        assert.equal(parsed.mode, 'paste')
    })

    it('keeps title empty when no hash label is provided', () => {
        const parsed = parseCommandEntries(`@run
uptime
df -h`)
        assert.equal(parsed.commands.length, 2)
        assert.equal(parsed.commands[0]?.title, '')
        assert.equal(parsed.entries[0]?.label, 'uptime')
        assert.equal(parsed.commands[0]?.mode, 'run')
        assert.equal(parsed.commands[1]?.mode, 'run')
    })

    it('parses description, ignores ## comments, and builds executable payload', () => {
        const parsed = parseCommandEntries(`@run
## not a label
# 磁盘 :: 查看磁盘使用
df -h
# :: 仅描述
uptime`)
        assert.equal(parsed.commands.length, 2)
        assert.equal(parsed.commands[0]?.title, '磁盘')
        assert.equal(parsed.commands[0]?.description, '查看磁盘使用')
        assert.equal(parsed.commands[1]?.title, '')
        assert.equal(parsed.commands[1]?.description, '仅描述')
        assert.equal(commandsToExecutableText(parsed.commands), 'df -h\nuptime\n')

        const roundTrip = serializeCommandEntries(parsed.commands)
        assert.ok(roundTrip.includes('# 磁盘 :: 查看磁盘使用'))
        assert.ok(roundTrip.includes('# :: 仅描述'))
        assert.ok(!roundTrip.includes('##'))
    })

    it('serializes structured commands with sectional mode lines', () => {
        const text = serializeCommandEntries([
            createSshCommandItem({title: '服务', command: '192.0.2.53', mode: 'paste'}),
            createSshCommandItem({title: '启动', command: 'trino', mode: 'run'}),
            createSshCommandItem({title: '', command: 'show catalogs;', mode: 'run'}),
        ])
        assert.ok(text.includes('@paste'))
        assert.ok(text.includes('# 服务'))
        assert.ok(text.includes('@run'))
        assert.ok(text.includes('# 启动'))
        assert.ok(text.includes('show catalogs;'))
        const again = parseCommandEntries(text)
        assert.equal(again.commands[0]?.mode, 'paste')
        assert.equal(again.commands[1]?.mode, 'run')
        assert.equal(again.commands[2]?.mode, 'run')
        assert.equal(again.commands[2]?.title, '')
    })

    it('hydrates legacy contentHtml into commands', () => {
        const hydrated = hydrateSshScriptRecord({
            id: 'r1',
            title: 'YARN',
            contentHtml: '@paste\n# 应用列表\nyarn application -list\n',
            updatedAt: 0,
        })
        assert.equal(hydrated.commands?.length, 1)
        assert.equal(hydrated.commands?.[0]?.title, '应用列表')
        assert.equal(hydrated.commands?.[0]?.mode, 'paste')
    })

    it('salvages commands poisoned by raw HTML migration', () => {
        const commands = resolveRecordCommands({
            id: 'r1',
            title: '状态',
            contentHtml: '<pre>@run\n# 磁盘\ndf -h</pre>',
            commands: [
                createSshCommandItem({title: '', command: '<pre>@run', mode: 'paste'}),
            ],
            updatedAt: 0,
        })
        assert.equal(commands.length, 1)
        assert.equal(commands[0]?.title, '磁盘')
        assert.equal(commands[0]?.command, 'df -h')
        assert.equal(commands[0]?.mode, 'run')
    })

    it('prefers structured commands over legacy contentHtml', () => {
        const groups = parseMyCommandGroups([
            {
                id: 'r1',
                title: 'Mixed',
                contentHtml: '@run\nold command\n',
                commands: [
                    createSshCommandItem({title: '新命令', command: 'echo new', mode: 'paste'}),
                ],
                updatedAt: 0,
            },
        ], 'Untitled')
        assert.equal(groups[0]?.entries.length, 1)
        assert.equal(groups[0]?.entries[0]?.command, 'echo new')
        assert.equal(groups[0]?.entries[0]?.mode, 'paste')
        assert.equal(groups[0]?.mode, 'paste')
    })

    it('marks multi-entry records as groups and built-in ids', () => {
        const groups = parseMyCommandGroups([
            {
                id: 'builtin-status',
                title: '状态',
                contentHtml: '<pre>@run\n# 磁盘\ndf -h</pre>',
                updatedAt: 0,
            },
            {
                id: 'r1',
                title: 'YARN',
                contentHtml: '<p># 查看应用列表</p><p>yarn application -list</p><p># 节点列表</p><p>yarn node -list -all</p>',
                updatedAt: 0,
            },
        ], 'Untitled')

        assert.equal(groups.length, 2)
        assert.equal(groups[0]?.builtIn, true)
        assert.equal(groups[0]?.mode, 'run')
        assert.equal(groups[1]?.multi, true)
        assert.equal(groups[1]?.entries.length, 2)
    })

    it('sorts pinned and built-in groups first', () => {
        const sorted = sortMyCommandGroups([
            {
                id: 'custom',
                title: 'Custom',
                entries: [{label: 'a', command: 'a'}],
                multi: false,
                mode: 'paste',
                builtIn: false,
                pinned: false,
            },
            {
                id: 'builtin-logs',
                title: 'Logs',
                entries: [{label: 'a', command: 'a'}],
                multi: false,
                mode: 'run',
                builtIn: true,
                pinned: false,
            },
            {
                id: 'pinned',
                title: 'Pinned',
                entries: [{label: 'a', command: 'a'}],
                multi: false,
                mode: 'paste',
                builtIn: false,
                pinned: true,
            },
        ])
        assert.equal(sorted[0]?.id, 'pinned')
        assert.equal(sorted[1]?.id, 'builtin-logs')
    })

    it('filters groups by title, label, and command', () => {
        const groups = parseMyCommandGroups([
            {
                id: 'r1',
                title: 'YARN',
                contentHtml: '<pre># 查看应用\nyarn application -list</pre>',
                updatedAt: 0,
            },
        ], 'Untitled')
        const filtered = filterMyCommandGroups(groups, 'application')
        assert.equal(filtered.length, 1)
        assert.equal(filtered[0]?.entries.length, 1)
    })

    it('summarizes long command labels', () => {
        const label = summarizeCommandLabel('yarn application -list -appStates RUNNING,ACCEPTED', 20)
        assert.ok(label.endsWith('…'))
        assert.ok(label.length <= 20)
    })

    it('detects built-in record ids', () => {
        assert.equal(isBuiltInScriptRecordId('builtin-logs'), true)
        assert.equal(isBuiltInScriptRecordId('custom-1'), false)
    })
})
