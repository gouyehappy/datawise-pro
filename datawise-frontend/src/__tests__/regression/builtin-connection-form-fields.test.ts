import assert from 'node:assert/strict'
import {describe, test} from 'node:test'
import type {ConnectionConfig} from '@/core/types'
import {
  BUILTIN_ELASTICSEARCH_FORM_FIELDS,
  BUILTIN_JDBC_FORM_FIELDS,
  BUILTIN_JENKINS_FORM_FIELDS,
  BUILTIN_KAFKA_FORM_FIELDS,
  BUILTIN_KUBERNETES_FORM_FIELDS,
  BUILTIN_KUDU_FORM_FIELDS,
  BUILTIN_ORACLE_FORM_FIELDS,
  BUILTIN_REDIS_FORM_FIELDS,
  BUILTIN_SSH_FORM_FIELDS,
  hasBuiltinConnectionFormFields,
  resolveBuiltinConnectionFormFields,
} from '@/features/connection/forms/builtin-connection-form-fields'
import {
  collectFieldValues,
  filterVisibleDescriptorFields,
  readDescriptorFieldValue,
  writeDescriptorFieldValue,
} from '@/features/connection/forms/descriptor-connection-bindings'

function emptyForm(partial: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    name: '',
    dbType: 'mysql',
    host: '',
    port: '',
    user: '',
    password: '',
    database: '',
    auth: 'User&Password',
    ...partial,
  } as ConnectionConfig
}

describe('builtin-connection-form-fields (S1)', () => {
  test('jdbc / kafka / ops / ssh resolve packs; only nacos stays handwritten', () => {
    assert.equal(resolveBuiltinConnectionFormFields('mysql'), BUILTIN_JDBC_FORM_FIELDS)
    assert.equal(resolveBuiltinConnectionFormFields('postgresql'), BUILTIN_JDBC_FORM_FIELDS)
    assert.equal(resolveBuiltinConnectionFormFields('sqlite3'), BUILTIN_JDBC_FORM_FIELDS)
    assert.equal(resolveBuiltinConnectionFormFields('oracle'), BUILTIN_ORACLE_FORM_FIELDS)
    assert.equal(resolveBuiltinConnectionFormFields('redis'), BUILTIN_REDIS_FORM_FIELDS)
    assert.equal(resolveBuiltinConnectionFormFields('kafka'), BUILTIN_KAFKA_FORM_FIELDS)
    assert.equal(resolveBuiltinConnectionFormFields('kudu'), BUILTIN_KUDU_FORM_FIELDS)
    assert.equal(resolveBuiltinConnectionFormFields('elasticsearch'), BUILTIN_ELASTICSEARCH_FORM_FIELDS)
    assert.equal(resolveBuiltinConnectionFormFields('jenkins'), BUILTIN_JENKINS_FORM_FIELDS)
    assert.equal(resolveBuiltinConnectionFormFields('kubernetes'), BUILTIN_KUBERNETES_FORM_FIELDS)
    assert.equal(resolveBuiltinConnectionFormFields('ssh'), BUILTIN_SSH_FORM_FIELDS)
    assert.ok(hasBuiltinConnectionFormFields('mongodb'))

    assert.equal(resolveBuiltinConnectionFormFields('nacos'), null)
    assert.equal(resolveBuiltinConnectionFormFields('plugin'), null)
  })

  test('JDBC pack hides user/password when auth is NONE', () => {
    const none = emptyForm({auth: 'NONE'})
    const visibleNone = filterVisibleDescriptorFields(BUILTIN_JDBC_FORM_FIELDS, none)
    assert.equal(visibleNone.some((f) => f.key === 'user'), false)
    assert.equal(visibleNone.some((f) => f.key === 'password'), false)
    assert.equal(visibleNone.some((f) => f.key === 'auth'), true)
    assert.equal(visibleNone.some((f) => f.key === 'host'), true)

    const withAuth = emptyForm({auth: 'User&Password'})
    const visibleAuth = filterVisibleDescriptorFields(BUILTIN_JDBC_FORM_FIELDS, withAuth)
    assert.equal(visibleAuth.some((f) => f.key === 'user'), true)
    assert.equal(visibleAuth.some((f) => f.key === 'password'), true)
  })

  test('oracle pack uses sid binding, not database', () => {
    const keys = BUILTIN_ORACLE_FORM_FIELDS.map((f) => f.key)
    assert.ok(keys.includes('sid'))
    assert.equal(keys.includes('database'), false)

    const form = emptyForm({dbType: 'oracle', sid: 'ORCL'})
    assert.equal(readDescriptorFieldValue(form, BUILTIN_ORACLE_FORM_FIELDS.find((f) => f.key === 'sid')!), 'ORCL')
    writeDescriptorFieldValue(form, BUILTIN_ORACLE_FORM_FIELDS.find((f) => f.key === 'sid')!, 'XE')
    assert.equal(form.sid, 'XE')
  })

  test('auth / url / host bindings round-trip on ConnectionConfig', () => {
    const form = emptyForm()
    const host = BUILTIN_JDBC_FORM_FIELDS.find((f) => f.key === 'host')!
    const auth = BUILTIN_JDBC_FORM_FIELDS.find((f) => f.key === 'auth')!
    const url = BUILTIN_JDBC_FORM_FIELDS.find((f) => f.key === 'url')!

    writeDescriptorFieldValue(form, host, 'db.example')
    writeDescriptorFieldValue(form, auth, 'NONE')
    writeDescriptorFieldValue(form, url, 'jdbc:mysql://db.example:3306/app')

    assert.equal(form.host, 'db.example')
    assert.equal(form.auth, 'NONE')
    assert.equal(form.url, 'jdbc:mysql://db.example:3306/app')
    assert.equal(collectFieldValues(form).host, 'db.example')
    assert.equal(collectFieldValues(form).auth, 'NONE')
  })

  test('kafka bootstrap + lines config keep key=value advancedConfig', () => {
    const form = emptyForm({dbType: 'kafka', auth: 'NONE'})
    const bootstrap = BUILTIN_KAFKA_FORM_FIELDS.find((f) => f.binding === 'kafka_bootstrap')!
    const security = BUILTIN_KAFKA_FORM_FIELDS.find((f) => f.key === 'security.protocol')!
    const lines = {configStorage: 'lines' as const}

    writeDescriptorFieldValue(form, bootstrap, 'broker-a:9092,broker-b:9093', lines)
    writeDescriptorFieldValue(form, security, 'SASL_SSL', lines)

    assert.match(form.advancedConfig || '', /bootstrap\.servers=broker-a:9092,broker-b:9093/)
    assert.match(form.advancedConfig || '', /security\.protocol=SASL_SSL/)
    assert.equal(form.host, 'broker-a')
    assert.equal(form.port, '9092')
    assert.equal(
      readDescriptorFieldValue(form, bootstrap, lines),
      'broker-a:9092,broker-b:9093',
    )
  })

  test('ssh jump fields appear only when sshEnabled', () => {
    const off = emptyForm({dbType: 'ssh', sshEnabled: false})
    assert.equal(
      filterVisibleDescriptorFields(BUILTIN_SSH_FORM_FIELDS, off).some((f) => f.key === 'sshHost'),
      false,
    )
    const on = emptyForm({dbType: 'ssh', sshEnabled: true})
    assert.equal(
      filterVisibleDescriptorFields(BUILTIN_SSH_FORM_FIELDS, on).some((f) => f.key === 'sshHost'),
      true,
    )
  })

  test('http_endpoint binding parses jenkins paste URL into host/port/https', () => {
    const form = emptyForm({dbType: 'jenkins', host: '', port: '', advancedConfig: ''})
    const field = BUILTIN_JENKINS_FORM_FIELDS[0]!
    writeDescriptorFieldValue(form, field, 'https://ci.example.com:8443/jenkins')
    assert.equal(form.host, 'ci.example.com')
    assert.equal(form.port, '8443')
    assert.match(form.advancedConfig || '', /useHttps=true/)
  })

  test('elasticsearch kibana flag toggles mode line and hides base path', () => {
    const form = emptyForm({dbType: 'elasticsearch'})
    const kibana = BUILTIN_ELASTICSEARCH_FORM_FIELDS.find((f) => f.binding === 'es_kibana')!
    const basePath = BUILTIN_ELASTICSEARCH_FORM_FIELDS.find((f) => f.key === 'kibanaBasePath')!
    const lines = {configStorage: 'lines' as const}

    writeDescriptorFieldValue(form, kibana, 'true', lines)
    assert.match(form.advancedConfig || '', /mode=kibana/)
    assert.equal(
      filterVisibleDescriptorFields(BUILTIN_ELASTICSEARCH_FORM_FIELDS, form).some(
        (f) => f.key === 'kibanaBasePath',
      ),
      true,
    )

    writeDescriptorFieldValue(form, basePath, '/kibana', lines)
    writeDescriptorFieldValue(form, kibana, 'false', lines)
    assert.equal(readDescriptorFieldValue(form, kibana, lines), 'false')
    assert.doesNotMatch(form.advancedConfig || '', /mode=kibana/)
    assert.doesNotMatch(form.advancedConfig || '', /kibanaBasePath=/)
  })
})
