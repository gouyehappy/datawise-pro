import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {auditFeaturePermissionSync} from '@/features/auth/services/feature-permission-audit.service'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const defaultBackendPath = path.resolve(
    scriptDir,
    '../../datawise-backend/datawise-common/src/main/java/org/apache/datawise/backend/domain/UserFeaturePermission.java',
)

function resolveBackendPath(): string {
    const arg = process.argv.find((item) => item.startsWith('--backend='))
    return arg ? arg.slice('--backend='.length) : defaultBackendPath
}

function main(): void {
    const backendPath = resolveBackendPath()
    const backendSource = fs.readFileSync(backendPath, 'utf8')
    const issues = auditFeaturePermissionSync(backendSource)

    console.log(`Feature permission audit: ${backendPath}`)
    console.log(`  frontend keys: ${Object.values(FeaturePermission).length}`)

    if (issues.length === 0) {
        console.log('  status: OK')
        process.exitCode = 0
        return
    }

    console.log('  status: ISSUES FOUND')
    for (const issue of issues) {
        console.log(`  - [${issue.kind}] ${issue.key}${issue.detail ? ` (${issue.detail})` : ''}`)
    }
    process.exitCode = 1
}

main()
