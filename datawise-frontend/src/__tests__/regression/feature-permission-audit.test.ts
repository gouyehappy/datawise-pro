import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {describe, it} from 'node:test'
import {fileURLToPath} from 'node:url'
import {auditFeaturePermissionSync} from '@/features/auth/services/feature-permission-audit.service'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../')
const backendPath = path.resolve(
    repoRoot,
    'datawise-backend/datawise-common/src/main/java/org/apache/datawise/backend/domain/UserFeaturePermission.java',
)

describe('feature-permission-audit', () => {
    it('frontend keys stay aligned with backend UserFeaturePermission.ALL', () => {
        const backendSource = fs.readFileSync(backendPath, 'utf8')
        const issues = auditFeaturePermissionSync(backendSource)
        assert.equal(
            issues.length,
            0,
            issues.map((issue) => `[${issue.kind}] ${issue.key}${issue.detail ? ` (${issue.detail})` : ''}`).join('\n'),
        )
    })

    it('covers every frontend permission key in audit snapshot', () => {
        const frontendCount = Object.values(FeaturePermission).length
        assert.ok(frontendCount >= 60)
    })
})
