import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {localizeTenantRoleName} from '@/features/auth/services/tenant-role-label'

describe('localizeTenantRoleName', () => {
    const translate = (key: string) => {
        const map: Record<string, string> = {
            'settings.userPermissions.roles.developer': '开发者',
            'settings.userPermissions.roles.tenant_admin': '租户管理员',
        }
        return map[key] ?? key
    }

    it('uses i18n for bootstrap English system role names', () => {
        assert.equal(localizeTenantRoleName('developer', 'Developer', translate), '开发者')
        assert.equal(localizeTenantRoleName('tenant_admin', 'Tenant Admin', translate), '租户管理员')
    })

    it('keeps custom display names', () => {
        assert.equal(localizeTenantRoleName('developer', '高级开发', translate), '高级开发')
    })

    it('falls back to key for unknown roles without name', () => {
        assert.equal(localizeTenantRoleName('ops_lead', '', translate), 'ops_lead')
    })
})
