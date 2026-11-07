import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {
    communityPluginContributionLabel,
    communityPluginAlternateName,
    communityPluginBaseName,
    communityPluginDisplayName,
    communityPluginFieldLabel,
    communityPluginFieldOptionLabel,
    resolveCommunityPluginLocalization,
    scopedCommunityPluginLocalization,
} from '@/features/community-plugin/lib/community-plugin-locale'
import type {CommunityPluginInfo} from '@/shared/api/http/community-plugins'

function pluginWith(localizations: unknown): CommunityPluginInfo {
    return {
        manifest: {
            manifestVersion: 1,
            id: 'io.datawise.example.hello',
            name: 'Hello Workbench',
            version: '1.0.0',
            localizations,
        },
        compatibility: {compatible: true, errors: [], warnings: []},
    } as CommunityPluginInfo
}

const zhBlock = {
    name: '你好工作台',
    description: '中文描述',
    contributions: {
        'io.datawise.example.hello.connection': {
            label: '你好连接',
            actions: {'import-private-key': {label: '导入私钥'}},
            fields: {
                host: {label: '主机'},
                token: {
                    label: '令牌',
                    options: {'private-key': '私钥登录'},
                },
            },
        },
    },
}

describe('community-plugin localization', () => {
    it('resolves the exact locale tag', () => {
        const loc = resolveCommunityPluginLocalization(
            pluginWith({'zh-CN': zhBlock}).manifest, 'zh-CN')
        assert.equal(loc?.name, '你好工作台')
    })

    it('falls back from regional to language tag (zh-TW → zh-CN via language part)', () => {
        const loc = resolveCommunityPluginLocalization(
            pluginWith({'zh-CN': zhBlock}).manifest, 'zh-TW')
        assert.equal(loc?.name, '你好工作台')
    })

    it('keeps the English base as the list title and the Chinese name as the alternate', () => {
        const plugin = pluginWith({'zh-CN': zhBlock})
        const loc = resolveCommunityPluginLocalization(plugin.manifest, 'zh-CN')
        assert.equal(communityPluginBaseName(plugin), 'Hello Workbench')
        assert.equal(communityPluginAlternateName(plugin, loc), '你好工作台')
        assert.equal(communityPluginAlternateName(plugin, null), '')
        assert.equal(communityPluginDisplayName(plugin, loc), '你好工作台')
    })

    it('returns null when the locale is missing and falls back to the English base', () => {
        const manifest = pluginWith({'zh-CN': zhBlock}).manifest
        assert.equal(resolveCommunityPluginLocalization(manifest, 'en-US'), null)
        assert.equal(communityPluginDisplayName(pluginWith(null), null), 'Hello Workbench')
        assert.equal(communityPluginDisplayName(pluginWith(undefined), undefined), 'Hello Workbench')
    })

    it('scopes contributions and fields with base-manifest fallback', () => {
        const manifest = pluginWith({'zh-CN': zhBlock}).manifest
        const loc = resolveCommunityPluginLocalization(manifest, 'zh-CN')
        const scoped = scopedCommunityPluginLocalization(loc, 'io.datawise.example.hello.connection')

        assert.equal(communityPluginContributionLabel(
            {id: 'io.datawise.example.hello.connection', label: 'SSH server'}, scoped), '你好连接')
        assert.equal(communityPluginContributionLabel(
            {id: 'io.datawise.example.hello.connection'}, {} as never), 'io.datawise.example.hello.connection')
        assert.equal(communityPluginFieldLabel({key: 'host', label: 'Host'}, scoped.fields?.host), '主机')
        assert.equal(communityPluginFieldLabel({key: 'port', label: 'Port'}, scoped.fields?.port), 'Port')
        assert.equal(communityPluginFieldOptionLabel(
            {value: 'private-key', label: 'Private key'}, scoped.fields?.token), '私钥登录')
        assert.equal(communityPluginFieldOptionLabel(
            {value: 'agent', label: 'SSH Agent'}, scoped.fields?.token), 'SSH Agent')
    })
})
