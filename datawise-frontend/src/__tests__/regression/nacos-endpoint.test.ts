import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {buildJdbcUrl} from '@/features/connection/utils/jdbc-url.ts'
import {
    defaultNacosContextPath,
    formatNacosConsoleAddress,
    formatVisibleNacosNamespaces,
    isRNacosWebConsoleAddress,
    nacosApiFamily,
    parseNacosConsoleAddress,
    readVisibleNacosNamespaces,
    upsertAdvancedProperty,
} from '@/features/connection/utils/nacos-endpoint.ts'

describe('nacos console address', () => {
    it('splits a pasted console URL into host, port, https, and context path', () => {
        assert.deepEqual(parseNacosConsoleAddress('http://192.0.2.119:8848/nacos'), {
            host: '192.0.2.119',
            port: '8848',
            https: false,
            contextPath: '/nacos',
        })
    })

    it('strips console page suffixes and query strings', () => {
        assert.equal(
            parseNacosConsoleAddress('https://nacos.example.com:8848/nacos/next/index.html?namespace=public')?.contextPath,
            '/nacos',
        )
        assert.equal(
            parseNacosConsoleAddress('http://nacos.example.com/nacos/index.html')?.https,
            false,
        )
    })

    it('keeps a custom context path', () => {
        assert.equal(
            parseNacosConsoleAddress('http://10.0.0.8:8080/gateway/nacos')?.contextPath,
            '/gateway/nacos',
        )
    })

    it('accepts a bare host or host:port without rewriting https', () => {
        assert.deepEqual(parseNacosConsoleAddress('192.0.2.119'), {host: '192.0.2.119'})
        assert.deepEqual(parseNacosConsoleAddress('192.0.2.119:8848'), {
            host: '192.0.2.119',
            port: '8848',
        })
    })

    it('formats the real console URL from advanced config', () => {
        const advanced = upsertAdvancedProperty(
            upsertAdvancedProperty('owner=ops', 'contextPath', '/gateway/nacos'),
            'useHttps',
            'true',
        )
        assert.match(advanced, /owner=ops/)
        assert.equal(
            formatNacosConsoleAddress('10.0.0.8', '8080', advanced),
            'https://10.0.0.8:8080/gateway/nacos',
        )
        assert.equal(
            buildJdbcUrl('nacos', '127.0.0.1', '8848'),
            'http://127.0.0.1:8848/nacos',
        )
    })

    it('uses the 3.x console root and keeps an r-nacos namespace', () => {
        assert.equal(
            formatNacosConsoleAddress('127.0.0.1', '8080', 'nacosVersionMode=v3\ncontextPath=/'),
            'http://127.0.0.1:8080',
        )
        assert.equal(
            defaultNacosContextPath('rnacos', 'auto', '8848'),
            '/nacos',
        )
        assert.equal(nacosApiFamily('rnacos', 'v3', '8848', '/nacos'), 'v1')
        assert.equal(nacosApiFamily('nacos', 'v3', '8080', '/'), 'v3')
        assert.equal(isRNacosWebConsoleAddress('http://127.0.0.1:10848'), true)
    })

    it('stores a namespace allow-list and treats a missing key as unrestricted', () => {
        assert.equal(readVisibleNacosNamespaces(''), null)
        assert.equal(formatVisibleNacosNamespaces([]), '__none__')
        assert.deepEqual(readVisibleNacosNamespaces('visibleNamespaces=__none__'), [])
        assert.deepEqual(
            readVisibleNacosNamespaces(`visibleNamespaces=${formatVisibleNacosNamespaces(['', 'dev-id'])}`),
            ['', 'dev-id'],
        )
    })
})
