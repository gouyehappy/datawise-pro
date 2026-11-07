import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    consoleInstanceScopeKey,
    formatConsoleInstanceOption,
    formatConsoleInstanceValue,
    showsConsoleInstanceSelector,
} from '../../features/workspace/services/console-instance-display.ts'

describe('console-instance-display', () => {
    it('hides instance selector for Trino cross-catalog queries', () => {
        assert.equal(showsConsoleInstanceSelector('trino'), false)
        assert.equal(showsConsoleInstanceSelector('presto'), false)
        assert.equal(showsConsoleInstanceSelector('mysql'), true)
    })

    it('uses schema label for Trino when selector is shown', () => {
        assert.equal(consoleInstanceScopeKey('trino'), 'ctxSchema')
        assert.equal(consoleInstanceScopeKey('mysql'), 'ctxInstance')
    })

    it('formats Trino value as catalog › schema', () => {
        assert.equal(formatConsoleInstanceValue('trino', 'hive.a003'), 'hive › a003')
    })

    it('formats Trino dropdown option with schema primary and catalog meta', () => {
        assert.deepEqual(formatConsoleInstanceOption('trino', 'kudu.a003'), {
            primary: 'a003',
            meta: 'kudu',
        })
    })

    it('keeps mysql database label unchanged', () => {
        assert.equal(formatConsoleInstanceValue('mysql', 'admin_db'), 'admin_db')
        assert.deepEqual(formatConsoleInstanceOption('mysql', 'admin_db'), {primary: 'admin_db'})
    })
})
