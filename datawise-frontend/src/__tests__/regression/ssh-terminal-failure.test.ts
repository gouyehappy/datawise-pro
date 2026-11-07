import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    classifySshTerminalFailure,
    isSshAuthFailureMessage,
    isSshFatalFailureMessage,
    isSshTransientFailureMessage,
    localizeSshTerminalError,
    sshAutoReconnectDelayMs,
    SSH_AUTO_RECONNECT_MAX_ATTEMPTS,
    SSH_BRIDGE_ERROR_CODES,
} from '@/features/terminal/services/ssh-terminal-failure'

describe('classifySshTerminalFailure', () => {
    it('treats auth failures as non-retryable', () => {
        const auth = classifySshTerminalFailure(
            'SSH authentication failed. Check username. Details: Auth fail for methods',
        )
        assert.equal(auth.kind, 'auth')
        assert.equal(auth.shouldAutoReconnect, false)
        assert.equal(isSshAuthFailureMessage(auth.kind && 'SSH authentication failed'), true)
    })

    it('treats timeouts and websocket drops as transient', () => {
        assert.equal(classifySshTerminalFailure('connect timed out').kind, 'transient')
        assert.equal(classifySshTerminalFailure('WebSocket closed').shouldAutoReconnect, true)
        assert.equal(isSshTransientFailureMessage('Connection refused'), true)
    })

    it('treats handshake / disabled terminal as fatal', () => {
        assert.equal(isSshFatalFailureMessage('WebSocket handshake rejected (auth)'), true)
        assert.equal(classifySshTerminalFailure('SSH terminal disabled').shouldAutoReconnect, false)
        assert.equal(
            classifySshTerminalFailure(SSH_BRIDGE_ERROR_CODES.NO_SESSION).shouldAutoReconnect,
            false,
        )
        assert.equal(
            classifySshTerminalFailure(SSH_BRIDGE_ERROR_CODES.WS_HANDSHAKE_REJECTED).kind,
            'fatal',
        )
    })

    it('localizes stable bridge error codes', () => {
        const translate = (key: string) => `L:${key}`
        assert.equal(
            localizeSshTerminalError(SSH_BRIDGE_ERROR_CODES.NO_SESSION, translate),
            'L:terminal.sshBridgeNoSession',
        )
        assert.equal(
            localizeSshTerminalError('Auth fail for methods', translate),
            'Auth fail for methods',
        )
    })

    it('uses exponential backoff capped at 15s', () => {
        assert.equal(sshAutoReconnectDelayMs(1), 2_000)
        assert.equal(sshAutoReconnectDelayMs(2), 4_000)
        assert.equal(sshAutoReconnectDelayMs(3), 8_000)
        assert.equal(sshAutoReconnectDelayMs(4), 15_000)
        assert.equal(SSH_AUTO_RECONNECT_MAX_ATTEMPTS, 5)
    })
})
