import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {reactive} from 'vue'
import {cloneForPostMessage} from '@/features/community-plugin/lib/pluginHostBridge'

/**
 * Monitor / community workbench tabs store nested objects on Pinia
 * (e.g. plugin:{mode:'monitor'}). postMessage(structuredClone) throws on
 * Vue Proxies and PanelErrorBoundary shows "界面渲染出错".
 */
describe('plugin host bridge postMessage clone', () => {
  it('turns Vue Proxy host context into structured-cloneable plain data', () => {
    const hostContext = reactive({
      connectionId: 'c-1',
      workbenchId: 'wb-1',
      plugin: {mode: 'monitor'},
      connection: {id: 'c-1', name: 'web-01', readOnly: false},
    })

    assert.throws(() => structuredClone(hostContext))
    assert.throws(() => structuredClone({type: 'datawise-plugin-env', context: hostContext}))

    const plain = cloneForPostMessage(hostContext)
    assert.deepEqual(plain, {
      connectionId: 'c-1',
      workbenchId: 'wb-1',
      plugin: {mode: 'monitor'},
      connection: {id: 'c-1', name: 'web-01', readOnly: false},
    })
    assert.doesNotThrow(() => structuredClone(plain))
    assert.doesNotThrow(() =>
      structuredClone({
        type: 'datawise-plugin-env',
        context: plain,
        theme: {appearance: 'dark', tokens: {'--color-background': '#000'}},
      }),
    )
  })
})
