import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    detectThirdPartyConnectionSource,
    draftsToConnectionConfigs,
    parseThirdPartyConnectionFile,
} from '@/features/explorer/services/third-party-connection-import'
import {parseJdbcUrlParts} from '@/features/explorer/services/third-party-connection-import/jdbc-url-parts'

const DATAGRIP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="DataSourceManagerImpl" format="xml" multifile-model="true">
    <data-source source="LOCAL" name="Local MySQL" uuid="u1">
      <driver-ref>mysql.8</driver-ref>
      <jdbc-driver>com.mysql.cj.jdbc.Driver</jdbc-driver>
      <jdbc-url>jdbc:mysql://127.0.0.1:3306/app</jdbc-url>
      <user-name>root</user-name>
    </data-source>
    <data-source source="LOCAL" name="PG" uuid="u2">
      <driver-ref>postgresql</driver-ref>
      <jdbc-url>jdbc:postgresql://db.example:5432/orders</jdbc-url>
    </data-source>
  </component>
</project>`

const DBEAVER_JSON = JSON.stringify({
    folders: {},
    connections: {
        'mysql-1': {
            provider: 'mysql',
            driver: 'mysql8',
            name: 'DBeaver MySQL',
            'save-password': true,
            configuration: {
                host: '10.0.0.2',
                port: '3306',
                database: 'shop',
                'auth-properties': {user: 'shop'},
            },
        },
    },
})

const NAVICAT_NCX = `<?xml version="1.0"?>
<Connections>
  <Connection ConnectionName="Prod" ConnType="MYSQL" Host="192.168.1.10" Port="3306" UserName="admin" Password="CIPHER" Database="app_db"/>
  <Connection ConnectionName="Cache" ConnType="REDIS" Host="127.0.0.1" Port="6379" UserName="" Password=""/>
  <Connection ConnectionName="Weird" ConnType="UNKNOWN_VENDOR" Host="x" Port="1"/>
</Connections>`

describe('T-IMPORT-1 third-party connection import', () => {
    it('detects sources by content and filename', () => {
        assert.equal(detectThirdPartyConnectionSource(DATAGRIP_XML, 'dataSources.xml'), 'datagrip')
        assert.equal(detectThirdPartyConnectionSource(DBEAVER_JSON, 'data-sources.json'), 'dbeaver')
        assert.equal(detectThirdPartyConnectionSource(NAVICAT_NCX, 'connections.ncx'), 'navicat')
        assert.equal(detectThirdPartyConnectionSource('{"connections":[]}', 'snapshot.json'), null)
    })

    it('parses DataGrip jdbc host/port/database', () => {
        const result = parseThirdPartyConnectionFile(DATAGRIP_XML, 'dataSources.xml')
        assert.ok(result)
        assert.equal(result.source, 'datagrip')
        assert.equal(result.drafts.length, 2)
        assert.equal(result.drafts[0].dbType, 'mysql')
        assert.equal(result.drafts[0].host, '127.0.0.1')
        assert.equal(result.drafts[0].port, '3306')
        assert.equal(result.drafts[0].database, 'app')
        assert.equal(result.drafts[0].user, 'root')
        assert.equal(result.drafts[0].passwordOmitted, true)
        assert.equal(result.drafts[1].dbType, 'postgresql')
        assert.equal(result.drafts[1].host, 'db.example')
    })

    it('parses DBeaver data-sources.json without decrypting credentials', () => {
        const result = parseThirdPartyConnectionFile(DBEAVER_JSON, 'data-sources.json')
        assert.ok(result)
        assert.equal(result.drafts.length, 1)
        assert.equal(result.drafts[0].name, 'DBeaver MySQL')
        assert.equal(result.drafts[0].host, '10.0.0.2')
        assert.equal(result.drafts[0].user, 'shop')
        assert.equal(result.drafts[0].passwordOmitted, true)
    })

    it('parses Navicat ncx and skips unknown types', () => {
        const result = parseThirdPartyConnectionFile(NAVICAT_NCX, 'a.ncx')
        assert.ok(result)
        assert.equal(result.drafts.length, 2)
        assert.equal(result.drafts[0].dbType, 'mysql')
        assert.equal(result.drafts[0].passwordOmitted, true)
        assert.equal(result.drafts[1].dbType, 'redis')
        assert.equal(result.skipped.length, 1)
        assert.match(result.skipped[0].reason, /UNKNOWN_VENDOR/)
    })

    it('maps drafts to ConnectionConfig with empty password', () => {
        const result = parseThirdPartyConnectionFile(DATAGRIP_XML, 'dataSources.xml')
        assert.ok(result)
        const configs = draftsToConnectionConfigs(result.drafts)
        assert.equal(configs.length, 2)
        assert.equal(configs[0].password, '')
        assert.equal(configs[0].name, 'Local MySQL')
        assert.match(configs[0].url, /jdbc:mysql/)
    })

    it('parseJdbcUrlParts handles mysql and oracle thin', () => {
        const mysql = parseJdbcUrlParts('jdbc:mysql://h:3307/db1')
        assert.equal(mysql?.host, 'h')
        assert.equal(mysql?.port, '3307')
        assert.equal(mysql?.database, 'db1')
        const oracle = parseJdbcUrlParts('jdbc:oracle:thin:@//ora.host:1521/ORCL')
        assert.equal(oracle?.host, 'ora.host')
        assert.equal(oracle?.port, '1521')
        assert.equal(oracle?.database, 'ORCL')
    })
})
