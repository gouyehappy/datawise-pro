import {describe, expect, it} from 'vitest'
import {nextScriptFileName} from '@/features/explorer/services/sql-script-naming'
import {
    buildProjectFileUri,
    isProjectFileUri,
    parseProjectFileUri,
} from '@/features/project/services/project-files-api'

describe('project scripts naming / uri', () => {
    it('allocates Script-N.sql from existing names', () => {
        expect(nextScriptFileName([])).toBe('Script-1.sql')
        expect(nextScriptFileName([{fileName: 'Script-1.sql'}, {fileName: 'Script-3.sql'}])).toBe(
            'Script-4.sql',
        )
    })

    it('round-trips project file URI', () => {
        const uri = buildProjectFileUri('proj_pay', 'scripts', 'Script-2.sql')
        expect(isProjectFileUri(uri)).toBe(true)
        expect(parseProjectFileUri(uri)).toEqual({
            projectId: 'proj_pay',
            root: 'scripts',
            path: 'Script-2.sql',
        })
    })
})
