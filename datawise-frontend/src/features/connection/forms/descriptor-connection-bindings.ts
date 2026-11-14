import type {ConnectionConfig} from '@/core/types'
import type {CommunityPluginFormField} from '@/shared/api/http/community-plugins'
import {
  readAdvancedProperty,
  removeAdvancedProperty,
  upsertAdvancedProperty,
} from '@/features/connection/utils/advanced-config'
import {
  applyKafkaBootstrap,
  readKafkaBootstrap,
  readKafkaSkipTlsVerify,
  writeKafkaSkipTlsVerify,
} from '@/features/connection/utils/kafka-security'
import {applyKuduMasters, readKuduMasters} from '@/features/connection/utils/kudu-masters'
import {
  applyParsedHttpEndpoint,
  formatHttpEndpoint,
  parseHttpEndpoint,
  type HttpEndpointKind,
} from '@/features/connection/utils/http-endpoint'

function httpEndpointKindOf(form: ConnectionConfig): HttpEndpointKind | null {
  const dbType = form.dbType
  if (dbType === 'jenkins' || dbType === 'polaris' || dbType === 'yarn' || dbType === 'kubernetes') {
    return dbType
  }
  return null
}

export function readHttpEndpointDisplay(form: ConnectionConfig): string {
  const kind = httpEndpointKindOf(form)
  if (!kind) return form.host || ''
  return formatHttpEndpoint(kind, form.host, form.port, form.advancedConfig)
}

export function writeHttpEndpointDisplay(form: ConnectionConfig, value: string): boolean {
  const kind = httpEndpointKindOf(form)
  if (!kind) return false
  const parsed = parseHttpEndpoint(value, kind)
  if (!parsed) return false
  const next = applyParsedHttpEndpoint(kind, parsed, {
    host: form.host,
    port: form.port,
    advancedConfig: form.advancedConfig,
  })
  form.host = next.host
  form.port = next.port
  form.advancedConfig = next.advancedConfig
  return true
}

/**
 * Field descriptor used by both community plugins and builtin connection forms.
 * Additive `readonly` is ignored by plugin manifests that do not set it.
 */
export type DescriptorFormField = CommunityPluginFormField & {
  readonly?: boolean
  options?: Array<{label?: string; value: string}>
  visible_when?: FieldCondition
  required_when?: FieldCondition
  options_action?: string
  picker?: {kind?: string; accept?: string[]; content_field?: string}
}

export type FieldCondition =
  | {field: string; one_of: Array<string | boolean | number>}
  | {all_of: FieldCondition[]}
  | {any_of: FieldCondition[]}

/** Parse advancedConfig as JSON object, falling back to key=value lines. */
export function readAdvancedMap(advancedConfig: string | undefined | null): Record<string, string> {
  const raw = advancedConfig?.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {}
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (value == null) continue
        out[key] = typeof value === 'string' ? value : String(value)
      }
      return out
    }
  } catch {
    // migrate legacy key=value lines
  }
  const out: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return out
}

export function writeAdvancedMap(form: ConnectionConfig, next: Record<string, string>): void {
  form.advancedConfig = JSON.stringify(next)
}

export function readSecretsMap(secrets: string | undefined | null): Record<string, string> {
  const raw = secrets?.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {}
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (value == null) continue
        out[key] = typeof value === 'string' ? value : String(value)
      }
      return out
    }
  } catch {
    // corrupt payload — start clean
  }
  return {}
}

export function writeSecretsMap(form: ConnectionConfig, next: Record<string, string>): void {
  form.secrets = JSON.stringify(next)
}

export function evalFieldCondition(
  condition: FieldCondition | undefined,
  values: Record<string, string>,
): boolean {
  if (!condition) return true
  if ('all_of' in condition) {
    return (condition.all_of || []).every((item) => evalFieldCondition(item, values))
  }
  if ('any_of' in condition) {
    return (condition.any_of || []).some((item) => evalFieldCondition(item, values))
  }
  if ('field' in condition && Array.isArray(condition.one_of)) {
    const current = String(values[condition.field] ?? '')
    return condition.one_of.map((item) => String(item)).includes(current)
  }
  return true
}

export function usesPasswordSlot(field: DescriptorFormField): boolean {
  return field.binding === 'password' || (field.binding === 'secret' && field.key === 'password')
}

export function usesSecretSlot(field: DescriptorFormField): boolean {
  if (usesPasswordSlot(field)) return false
  const binding = field.binding || 'config'
  return binding === 'secret' || field.type === 'password'
}

export type DescriptorWriteOptions = {
  /**
   * How `binding: config` persists into advancedConfig.
   * - json: community plugins (multiline / nested-friendly)
   * - lines: builtin connectors (key=value, matches Kafka/ES/Nacos helpers)
   */
  configStorage?: 'json' | 'lines'
}

export function collectFieldValues(form: ConnectionConfig): Record<string, string> {
  return {
    ...readAdvancedMap(form.advancedConfig),
    ...readSecretsMap(form.secrets),
    host: form.host || '',
    port: form.port || '',
    user: form.user || '',
    password: form.password || '',
    database: form.database || '',
    name: form.name || '',
    auth: form.auth || '',
    url: form.url || '',
    sid: form.sid || '',
    sshEnabled: form.sshEnabled ? 'true' : 'false',
    sshHost: form.sshHost || '',
    sshPort: form.sshPort || '',
    sshUser: form.sshUser || '',
    'bootstrap.servers': readKafkaBootstrap(form),
    'kudu.masters': readKuduMasters(form),
    http_endpoint: readHttpEndpointDisplay(form),
    kafka_skip_tls: readKafkaSkipTlsVerify(form.advancedConfig) ? 'true' : 'false',
    es_kibana: readAdvancedProperty(form.advancedConfig, 'mode') === 'kibana' ? 'true' : 'false',
  }
}

function readConfigKey(form: ConnectionConfig, key: string, storage: 'json' | 'lines'): string {
  if (storage === 'lines') {
    return readAdvancedProperty(form.advancedConfig, key) ?? ''
  }
  return readAdvancedMap(form.advancedConfig)[key] || ''
}

function writeConfigKey(
  form: ConnectionConfig,
  key: string,
  value: string,
  storage: 'json' | 'lines',
): void {
  if (storage === 'lines') {
    form.advancedConfig =
      value === ''
        ? removeAdvancedProperty(form.advancedConfig, key)
        : upsertAdvancedProperty(form.advancedConfig, key, value)
    return
  }
  const next = readAdvancedMap(form.advancedConfig)
  if (value === '') delete next[key]
  else next[key] = value
  writeAdvancedMap(form, next)
}

export function readDescriptorFieldValue(
  form: ConnectionConfig,
  field: DescriptorFormField,
  options?: DescriptorWriteOptions,
): string {
  const binding = field.binding || 'config'
  const storage = options?.configStorage ?? 'json'
  if (binding === 'name') return form.name || ''
  if (binding === 'host') return form.host || ''
  if (binding === 'port') return form.port || ''
  if (binding === 'username' || binding === 'user') return form.user || ''
  if (usesPasswordSlot(field)) return form.password || ''
  if (binding === 'database') return form.database || ''
  if (binding === 'auth') return form.auth || ''
  if (binding === 'url') return form.url || ''
  if (binding === 'sid') return form.sid || ''
  if (binding === 'kafka_bootstrap') return readKafkaBootstrap(form)
  if (binding === 'kudu_masters') return readKuduMasters(form)
  if (binding === 'http_endpoint') return readHttpEndpointDisplay(form)
  if (binding === 'kafka_skip_tls') {
    return readKafkaSkipTlsVerify(form.advancedConfig) ? 'true' : 'false'
  }
  if (binding === 'es_kibana') {
    return readAdvancedProperty(form.advancedConfig, 'mode') === 'kibana' ? 'true' : 'false'
  }
  if (binding === 'sshEnabled') return form.sshEnabled ? 'true' : 'false'
  if (binding === 'sshPrivateKey') return form.sshPrivateKey || ''
  if (binding === 'sshPassphrase') return form.sshPassphrase || ''
  if (binding === 'sshHost') return form.sshHost || ''
  if (binding === 'sshPort') return form.sshPort || ''
  if (binding === 'sshUser') return form.sshUser || ''
  if (binding === 'sshPassword') return form.sshPassword || ''
  if (binding === 'jumpPrivateKey') return form.jumpPrivateKey || ''
  if (binding === 'jumpPassphrase') return form.jumpPassphrase || ''
  if (usesSecretSlot(field)) return readSecretsMap(form.secrets)[field.key] || ''
  return readConfigKey(form, field.key, storage)
}

export function writeDescriptorFieldValue(
  form: ConnectionConfig,
  field: DescriptorFormField,
  value: string,
  options?: DescriptorWriteOptions,
): void {
  const binding = field.binding || 'config'
  const storage = options?.configStorage ?? 'json'
  if (binding === 'name') {
    form.name = value
    return
  }
  if (binding === 'host') {
    form.host = value
    return
  }
  if (binding === 'port') {
    form.port = value
    return
  }
  if (binding === 'username' || binding === 'user') {
    form.user = value
    return
  }
  if (usesPasswordSlot(field)) {
    form.password = value
    return
  }
  if (binding === 'database') {
    form.database = value
    return
  }
  if (binding === 'auth') {
    form.auth = value
    return
  }
  if (binding === 'url') {
    form.url = value
    return
  }
  if (binding === 'sid') {
    form.sid = value
    return
  }
  if (binding === 'kafka_bootstrap') {
    applyKafkaBootstrap(form, value)
    return
  }
  if (binding === 'kudu_masters') {
    applyKuduMasters(form, value)
    return
  }
  if (binding === 'http_endpoint') {
    writeHttpEndpointDisplay(form, value)
    return
  }
  if (binding === 'kafka_skip_tls') {
    const skip = value === 'true' || value === '1' || value === 'yes'
    form.advancedConfig = writeKafkaSkipTlsVerify(form.advancedConfig, skip)
    return
  }
  if (binding === 'es_kibana') {
    const enabled = value === 'true' || value === '1' || value === 'yes'
    form.advancedConfig = enabled
      ? upsertAdvancedProperty(form.advancedConfig, 'mode', 'kibana')
      : removeAdvancedProperty(removeAdvancedProperty(form.advancedConfig, 'mode'), 'kibanaBasePath')
    return
  }
  if (binding === 'sshEnabled') {
    form.sshEnabled = value === 'true' || value === '1' || value === 'yes'
    return
  }
  if (binding === 'sshPrivateKey') {
    form.sshPrivateKey = value
    return
  }
  if (binding === 'sshPassphrase') {
    form.sshPassphrase = value
    return
  }
  if (binding === 'sshHost') {
    form.sshHost = value
    return
  }
  if (binding === 'sshPort') {
    form.sshPort = value
    return
  }
  if (binding === 'sshUser') {
    form.sshUser = value
    return
  }
  if (binding === 'sshPassword') {
    form.sshPassword = value
    return
  }
  if (binding === 'jumpPrivateKey') {
    form.jumpPrivateKey = value
    return
  }
  if (binding === 'jumpPassphrase') {
    form.jumpPassphrase = value
    return
  }
  if (usesSecretSlot(field)) {
    const next = readSecretsMap(form.secrets)
    if (value === '') delete next[field.key]
    else next[field.key] = value
    writeSecretsMap(form, next)
    return
  }
  // Builtin key=value flags: off clears the line (matches upsert helpers).
  if (field.type === 'boolean' && storage === 'lines') {
    const on = value === 'true' || value === '1' || value === 'yes'
    writeConfigKey(form, field.key, on ? 'true' : '', storage)
    return
  }
  writeConfigKey(form, field.key, value, storage)
}

export function isDescriptorFieldRequired(
  field: DescriptorFormField,
  values: Record<string, string>,
): boolean {
  if (field.required_when) return evalFieldCondition(field.required_when as FieldCondition, values)
  return Boolean(field.required)
}

export function filterVisibleDescriptorFields(
  fields: DescriptorFormField[],
  form: ConnectionConfig,
): DescriptorFormField[] {
  const values = collectFieldValues(form)
  return fields.filter((field) => {
    // Host chrome already owns the connection name row.
    if ((field.binding || 'config') === 'name') return false
    return evalFieldCondition(field.visible_when as FieldCondition | undefined, values)
  })
}
