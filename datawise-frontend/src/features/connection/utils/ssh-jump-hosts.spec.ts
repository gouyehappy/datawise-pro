import {describe, expect, it} from 'vitest'
import {validateJumpHostsText} from './ssh-jump-hosts'

describe('validateJumpHostsText', () => {
    it('accepts empty and valid hops', () => {
        expect(validateJumpHostsText('')).toEqual({ok: true, hopCount: 0})
        expect(validateJumpHostsText('[]')).toEqual({ok: true, hopCount: 0})
        const ok = validateJumpHostsText(
            '[{"host":"bastion.example.com","port":2202,"username":"ops","password":"jp"}]',
        )
        expect(ok.ok).toBe(true)
        if (ok.ok) expect(ok.hopCount).toBe(1)
    })

    it('rejects bad JSON and missing credentials', () => {
        expect(validateJumpHostsText('{').ok).toBe(false)
        expect(validateJumpHostsText('[{"host":"bastion","username":"ops"}]').ok).toBe(false)
        expect(validateJumpHostsText('[{"host":"ssh://x","username":"u","password":"p"}]').ok).toBe(false)
    })

    it('rejects too many hops and duplicates', () => {
        const many = JSON.stringify([
            {host: 'a', username: 'u', password: 'p'},
            {host: 'b', username: 'u', password: 'p'},
            {host: 'c', username: 'u', password: 'p'},
            {host: 'd', username: 'u', password: 'p'},
        ])
        expect(validateJumpHostsText(many).ok).toBe(false)
        const dup = JSON.stringify([
            {host: 'bastion', port: 22, username: 'ops', password: 'a'},
            {host: 'bastion', port: 22, username: 'ops', password: 'b'},
        ])
        const result = validateJumpHostsText(dup)
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toMatch(/repeats/)
    })
})
