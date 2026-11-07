import {
    readAdvancedProperty,
    removeAdvancedProperty,
    upsertAdvancedProperty,
} from '@/features/connection/utils/advanced-config'

const BOOTSTRAP = 'bootstrap.servers'
const SECURITY_PROTOCOL = 'security.protocol'
const SASL_MECHANISM = 'sasl.mechanism'
const ENDPOINT_ALGORITHM = 'ssl.endpoint.identification.algorithm'

export const KAFKA_SECURITY_PROTOCOLS = ['PLAINTEXT', 'SSL', 'SASL_PLAINTEXT', 'SASL_SSL'] as const
export const KAFKA_SASL_MECHANISMS = ['PLAIN', 'SCRAM-SHA-256', 'SCRAM-SHA-512'] as const

/** True when the Kafka client is told to skip TLS hostname verification. */
export function readKafkaSkipTlsVerify(advancedConfig: string | undefined): boolean {
    if (!advancedConfig?.trim()) return false
    const prefix = `${ENDPOINT_ALGORITHM.toLowerCase()}=`
    for (const line of advancedConfig.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        if (trimmed.toLowerCase().startsWith(prefix)) {
            return trimmed.slice(trimmed.indexOf('=') + 1).trim() === ''
        }
    }
    return false
}

/** Toggle only the endpoint-algorithm line. Security protocol is a separate field. */
export function writeKafkaSkipTlsVerify(advancedConfig: string | undefined, skip: boolean): string {
    if (skip) return upsertAdvancedProperty(advancedConfig, ENDPOINT_ALGORITHM, '')
    return removeAdvancedProperty(advancedConfig, ENDPOINT_ALGORITHM)
}

export function readKafkaBootstrap(form: {
    host?: string
    port?: string
    advancedConfig?: string
}): string {
    const fromAdvanced = readAdvancedProperty(form.advancedConfig, BOOTSTRAP)
    if (fromAdvanced) return fromAdvanced
    const host = form.host?.trim() || ''
    if (!host) return 'localhost:9092'
    if (host.includes(',') || host.includes(':')) return host
    const port = form.port?.trim() || '9092'
    return `${host}:${port}`
}

export function applyKafkaBootstrap(
    form: { host: string; port: string; advancedConfig?: string },
    value: string,
): void {
    const trimmed = value.trim()
    form.advancedConfig = trimmed
        ? upsertAdvancedProperty(form.advancedConfig, BOOTSTRAP, trimmed)
        : removeAdvancedProperty(form.advancedConfig, BOOTSTRAP)
    const first = trimmed.split(',')[0]?.trim() || ''
    const colon = first.lastIndexOf(':')
    if (colon > 0 && /^\d+$/.test(first.slice(colon + 1))) {
        form.host = first.slice(0, colon)
        form.port = first.slice(colon + 1)
        return
    }
    if (first) {
        form.host = first
        form.port = '9092'
    }
}

/** Empty string means Auto (do not write security.protocol). */
export function readKafkaSecurityProtocol(advancedConfig: string | undefined): string {
    return readAdvancedProperty(advancedConfig, SECURITY_PROTOCOL) || ''
}

export function writeKafkaSecurityProtocol(advancedConfig: string | undefined, value: string): string {
    if (!value.trim()) return removeAdvancedProperty(advancedConfig, SECURITY_PROTOCOL)
    return upsertAdvancedProperty(advancedConfig, SECURITY_PROTOCOL, value.trim())
}

export function readKafkaSaslMechanism(advancedConfig: string | undefined): string {
    return readAdvancedProperty(advancedConfig, SASL_MECHANISM) || 'PLAIN'
}

export function writeKafkaSaslMechanism(advancedConfig: string | undefined, value: string): string {
    return upsertAdvancedProperty(advancedConfig, SASL_MECHANISM, value.trim() || 'PLAIN')
}
