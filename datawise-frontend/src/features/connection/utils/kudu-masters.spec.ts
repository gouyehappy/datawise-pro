import {describe, expect, it} from 'vitest'
import {applyKuduMasters, readKuduMasters} from '@/features/connection/utils/kudu-masters'

describe('kudu masters', () => {
    it('joins a single host and port', () => {
        expect(readKuduMasters({host: '10.0.0.1', port: '7051'})).toBe('10.0.0.1:7051')
    })

    it('keeps a comma-separated host list', () => {
        expect(readKuduMasters({
            host: 'master1:7051,master2:7051',
            port: '7051',
        })).toBe('master1:7051,master2:7051')
    })

    it('prefers the typed masters string over the split host', () => {
        expect(readKuduMasters({
            host: '10.0.0.1',
            port: '7051',
            advancedConfig: 'kudu.masters=10.0.0.1',
        })).toBe('10.0.0.1')
    })

    it('splits one host:port and stores the typed text', () => {
        const form = {host: '', port: '', advancedConfig: ''}
        applyKuduMasters(form, '10.0.0.1:7051')
        expect(form.host).toBe('10.0.0.1')
        expect(form.port).toBe('7051')
        expect(readKuduMasters(form)).toBe('10.0.0.1:7051')
    })

    it('keeps a cluster list in host so the url stays one string', () => {
        const form = {host: '', port: '', advancedConfig: 'other=1'}
        applyKuduMasters(form, 'master1:7051,master2:8051')
        expect(form.host).toBe('master1:7051,master2:8051')
        expect(form.port).toBe('7051')
        expect(form.advancedConfig).toContain('kudu.masters=master1:7051,master2:8051')
        expect(form.advancedConfig).toContain('other=1')
        expect(readKuduMasters(form)).toBe('master1:7051,master2:8051')
    })
})
