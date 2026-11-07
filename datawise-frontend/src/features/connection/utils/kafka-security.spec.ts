import {describe, expect, it} from 'vitest'
import {
    applyKafkaBootstrap,
    readKafkaBootstrap,
    readKafkaSaslMechanism,
    readKafkaSecurityProtocol,
    readKafkaSkipTlsVerify,
    writeKafkaSaslMechanism,
    writeKafkaSecurityProtocol,
    writeKafkaSkipTlsVerify,
} from '@/features/connection/utils/kafka-security'

describe('kafka skip tls verify', () => {
    it('writes only the empty endpoint algorithm line', () => {
        const next = writeKafkaSkipTlsVerify('sasl.mechanism=PLAIN\n', true)
        expect(readKafkaSkipTlsVerify(next)).toBe(true)
        expect(next.includes('security.protocol')).toBe(false)
        expect(next).toMatch(/ssl\.endpoint\.identification\.algorithm=/)
        expect(next).toMatch(/sasl\.mechanism=PLAIN/)
    })

    it('removes only the algorithm line', () => {
        const withSkip = writeKafkaSkipTlsVerify('sasl.mechanism=PLAIN', true)
        const cleared = writeKafkaSkipTlsVerify(withSkip, false)
        expect(readKafkaSkipTlsVerify(cleared)).toBe(false)
        expect(cleared.includes('ssl.endpoint.identification.algorithm')).toBe(false)
        expect(cleared).toMatch(/sasl\.mechanism=PLAIN/)
    })

    it('keeps security.protocol when unchecking', () => {
        const cleared = writeKafkaSkipTlsVerify(
            'security.protocol=SASL_SSL\nssl.endpoint.identification.algorithm=',
            false,
        )
        expect(readKafkaSkipTlsVerify(cleared)).toBe(false)
        expect(cleared).toMatch(/security\.protocol=SASL_SSL/)
    })
})

describe('kafka connection fields', () => {
    it('reads bootstrap from advanced config, else host and port', () => {
        expect(readKafkaBootstrap({
            host: 'ignored',
            port: '9092',
            advancedConfig: 'bootstrap.servers=a:9092,b:9092',
        })).toBe('a:9092,b:9092')
        expect(readKafkaBootstrap({host: 'broker.local', port: '9093'})).toBe('broker.local:9093')
    })

    it('writes bootstrap and mirrors the first broker onto host and port', () => {
        const form = {host: 'localhost', port: '9092', advancedConfig: ''}
        applyKafkaBootstrap(form, 'host1:9092,host2:9093')
        expect(form.host).toBe('host1')
        expect(form.port).toBe('9092')
        expect(form.advancedConfig).toMatch(/bootstrap\.servers=host1:9092,host2:9093/)
    })

    it('treats an empty protocol as Auto', () => {
        expect(readKafkaSecurityProtocol('')).toBe('')
        const next = writeKafkaSecurityProtocol('', 'SASL_SSL')
        expect(readKafkaSecurityProtocol(next)).toBe('SASL_SSL')
        expect(readKafkaSecurityProtocol(writeKafkaSecurityProtocol(next, ''))).toBe('')
    })

    it('defaults sasl mechanism to PLAIN', () => {
        expect(readKafkaSaslMechanism('')).toBe('PLAIN')
        expect(readKafkaSaslMechanism(writeKafkaSaslMechanism('', 'SCRAM-SHA-256'))).toBe('SCRAM-SHA-256')
    })
})
