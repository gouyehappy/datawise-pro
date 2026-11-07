import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    resolveApiErrorMessage,
    resolveCaughtApiErrorMessage,
    resolveDisplayApiErrorMessage,
} from '@/shared/api/http/api-error-message'
import {ApiError, HTTP_NOT_READY} from '@/shared/api/http/request'

describe('api-error-message', () => {
    const translate = (key: string) => `tr:${key}`

    it('resolves raw error message', () => {
        assert.equal(resolveApiErrorMessage(new Error('NETWORK_FAIL')), 'NETWORK_FAIL')
    })

    it('maps stable permission codes to i18n keys', () => {
        assert.equal(
            resolveDisplayApiErrorMessage(new Error('PERMISSION_DENIED'), translate),
            'tr:auth.permissionDenied',
        )
        assert.equal(
            resolveDisplayApiErrorMessage(new Error('GUEST_NOT_ALLOWED'), translate),
            'tr:auth.guestNotAllowed',
        )
        assert.equal(
            resolveDisplayApiErrorMessage(new Error('ADMIN_REQUIRED'), translate),
            'tr:auth.adminRequired',
        )
        assert.equal(
            resolveDisplayApiErrorMessage(new Error('TENANT_LAST_ADMIN'), translate),
            'tr:auth.errors.TENANT_LAST_ADMIN',
        )
        assert.equal(
            resolveDisplayApiErrorMessage(new Error('ROLE_KEY_INVALID'), translate),
            'tr:auth.errors.ROLE_KEY_INVALID',
        )
    })

    it('maps connection access denied including detail suffix', () => {
        assert.equal(
            resolveDisplayApiErrorMessage(new Error('CONNECTION_ACCESS_DENIED'), translate),
            'tr:auth.errors.CONNECTION_ACCESS_DENIED',
        )
        assert.equal(
            resolveDisplayApiErrorMessage(
                new Error('CONNECTION_ACCESS_DENIED connectionId=x required=DDL'),
                translate,
            ),
            'tr:auth.errors.CONNECTION_ACCESS_DENIED',
        )
    })

    it('maps API token and HTTP readiness messages', () => {
        assert.equal(
            resolveDisplayApiErrorMessage(new Error('API_TOKEN_FORBIDDEN'), translate),
            'tr:auth.errors.API_TOKEN_FORBIDDEN',
        )
        assert.equal(
            resolveDisplayApiErrorMessage(new Error(HTTP_NOT_READY), translate),
            'tr:auth.errors.HTTP_NOT_READY',
        )
        assert.equal(
            resolveDisplayApiErrorMessage(new Error('HTTP 502'), translate),
            'tr:auth.errors.HTTP_STATUS',
        )
    })

    it('maps ddl-not-supported and fake-data english strings', () => {
        assert.equal(
            resolveDisplayApiErrorMessage(
                new Error('CREATE DATABASE is not supported for dbType=mongodb'),
                translate,
            ),
            'tr:auth.errors.DDL_NOT_SUPPORTED',
        )
        assert.equal(
            resolveDisplayApiErrorMessage(new Error('Fake data generation is not available'), translate),
            'tr:auth.errors.FAKE_DATA_NOT_AVAILABLE',
        )
    })

    it('maps legacy unknown-role prefix', () => {
        assert.equal(
            resolveDisplayApiErrorMessage(new Error('unknown role: ops'), translate),
            'tr:auth.errors.TENANT_ROLE_UNKNOWN',
        )
    })

    it('maps datasource-not-available to product copy with type label', () => {
        const translateLocal = (key: string) => {
            if (key === 'auth.errors.DATASOURCE_NOT_AVAILABLE') {
                return '尚未安装 {type} 连接器。请到「设置 → 连接器市场」安装并加载后再试。'
            }
            return `tr:${key}`
        }
        assert.equal(
            resolveDisplayApiErrorMessage(new Error('DATASOURCE_NOT_AVAILABLE: mongodb'), translateLocal),
            '尚未安装 MongoDB 连接器。请到「设置 → 连接器市场」安装并加载后再试。',
        )
        assert.equal(
            resolveDisplayApiErrorMessage(
                new ApiError('DATASOURCE_NOT_AVAILABLE: mongodb', {
                    errorCode: 'DATASOURCE_NOT_AVAILABLE',
                    dbType: 'mongodb',
                }),
                translateLocal,
            ),
            '尚未安装 MongoDB 连接器。请到「设置 → 连接器市场」安装并加载后再试。',
        )
    })

    it('maps SQL session/cursor/concurrency stable codes to i18n', () => {
        assert.equal(
            resolveDisplayApiErrorMessage(
                new ApiError('SQL session not found or already closed', {errorCode: 'SQL_SESSION_GONE'}),
                translate,
            ),
            'tr:auth.errors.SQL_SESSION_GONE',
        )
        assert.equal(
            resolveDisplayApiErrorMessage(
                new ApiError('SQL cursor not found or expired', {errorCode: 'SQL_CURSOR_GONE'}),
                translate,
            ),
            'tr:auth.errors.SQL_CURSOR_GONE',
        )
        assert.equal(
            resolveDisplayApiErrorMessage(
                new ApiError('Too many concurrent SQL executions (global limit 64)', {
                    errorCode: 'SQL_CONCURRENCY_LIMIT',
                }),
                translate,
            ),
            'tr:auth.errors.SQL_CONCURRENCY_LIMIT',
        )
        assert.equal(
            resolveDisplayApiErrorMessage(
                new ApiError('Document table data offset exceeds maximum of 100000', {
                    errorCode: 'TABLE_DATA_OFFSET_LIMIT',
                }),
                translate,
            ),
            'tr:auth.errors.TABLE_DATA_OFFSET_LIMIT',
        )
    })

    it('prefers backend SQL execution detail over short i18n label', () => {
        const translateLocal = (key: string) => {
            if (key === 'auth.errors.SQL_EXECUTION_FAILED') return 'SQL 执行失败'
            if (key === 'auth.errors.SQL_QUERY_TIMEOUT') return '查询超时，请缩小范围或稍后重试'
            return `tr:${key}`
        }
        const detail =
            "SQLException: Syntax error in SQL statement \"...ON on t1.user_id...\""
        assert.equal(
            resolveDisplayApiErrorMessage(
                new ApiError(detail, {errorCode: 'SQL_EXECUTION_FAILED'}),
                translateLocal,
            ),
            detail,
        )
        assert.equal(
            resolveDisplayApiErrorMessage(
                new ApiError('SQL execution failed', {errorCode: 'SQL_EXECUTION_FAILED'}),
                translateLocal,
            ),
            'SQL 执行失败',
        )
        assert.equal(
            resolveDisplayApiErrorMessage(
                new ApiError('Query timed out after 30s', {errorCode: 'SQL_QUERY_TIMEOUT'}),
                translateLocal,
            ),
            'Query timed out after 30s',
        )
    })

    it('resolveCaughtApiErrorMessage prefers localized stable codes then fallback', () => {
        assert.equal(
            resolveCaughtApiErrorMessage(new Error('PERMISSION_DENIED'), translate, 'team.loadFailed'),
            'tr:auth.permissionDenied',
        )
        assert.equal(
            resolveCaughtApiErrorMessage(new Error('SOME_UNKNOWN_CODE'), translate, 'team.loadFailed'),
            'tr:team.loadFailed',
        )
        assert.equal(
            resolveCaughtApiErrorMessage(new Error('连接超时请重试'), translate, 'team.loadFailed'),
            '连接超时请重试',
        )
    })
})
