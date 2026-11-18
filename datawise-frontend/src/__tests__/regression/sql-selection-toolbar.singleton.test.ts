import {describe, it, beforeEach} from 'node:test'
import assert from 'node:assert/strict'
import {
  getSqlSelectionToolbarState,
  hideSqlSelectionToolbar,
  registerToolbarController,
  runSqlSelectionToolbarAction,
  showSqlSelectionToolbar,
  unregisterToolbarController,
} from '../../features/workspace/services/sql-selection-toolbar.singleton.ts'

describe('SQL 选中浮层单例：state/action 生命周期', () => {
  beforeEach(() => {
    hideSqlSelectionToolbar()
  })

  it('展示后记录选中快照与动作，点击执行只触发当前 owner 的闭包并自动收起', () => {
    const calls: string[] = []
    showSqlSelectionToolbar(
        'tab-a',
        {selectedText: 'select 1', x: 120, y: 240, explainSupported: true},
        {
          run: () => calls.push('run:select 1'),
          explain: () => calls.push('explain:select 1'),
          format: () => calls.push('format'),
        },
    )

    const state = getSqlSelectionToolbarState()
    assert.equal(state.visible, true)
    assert.equal(state.x, 120)
    assert.equal(state.y, 240)
    assert.equal(state.explainSupported, true)

    runSqlSelectionToolbarAction('run')
    assert.deepEqual(calls, ['run:select 1'])
    assert.equal(getSqlSelectionToolbarState().visible, false)

    // 收起后再点不应重复执行上一次的 SQL（防已销毁 Tab 的动作闭包被误触发）。
    runSqlSelectionToolbarAction('run')
    assert.deepEqual(calls, ['run:select 1'])
  })

  it('空白选区直接隐藏，不注册动作', () => {
    showSqlSelectionToolbar(
        'tab-a',
        {selectedText: '   \n', x: 10, y: 20, explainSupported: false},
        {
          run: () => assert.fail('不应执行'),
          explain: () => assert.fail('不应 EXPLAIN'),
          format: () => assert.fail('不应格式化'),
        },
    )
    assert.equal(getSqlSelectionToolbarState().visible, false)
    runSqlSelectionToolbarAction('run')
  })

  it('非 owner Tab 的隐藏请求无效，防止后台 Tab 抢占浮层', () => {
    showSqlSelectionToolbar(
        'tab-a',
        {selectedText: 'select 2', x: 0, y: 0, explainSupported: false},
        {
          run: () => {},
          explain: () => {},
          format: () => {},
        },
    )
    hideSqlSelectionToolbar('tab-b')
    assert.equal(getSqlSelectionToolbarState().visible, true)

    hideSqlSelectionToolbar('tab-a')
    assert.equal(getSqlSelectionToolbarState().visible, false)
  })

  it('复现用户序列：选中→执行→再次选中，controller 每次都收到完整状态快照', () => {
    const applies: Array<{visible: boolean; x: number}> = []
    const controller = {
      apply: (state: {visible: boolean; x: number}) => {
        applies.push({visible: state.visible, x: state.x})
      },
    }
    registerToolbarController(controller)
    try {
      const show = (x: number) => showSqlSelectionToolbar(
          'tab-a',
          {selectedText: 'select 1', x, y: 10, explainSupported: false},
          {run: () => {}, explain: () => {}, format: () => {}},
      )
      show(100)
      runSqlSelectionToolbarAction('run')
      // 模拟第一次执行后结果面板挂载、DOM 发生变化，再第二次选中
      show(300)

      assert.deepEqual(applies, [
        {visible: false, x: 0},
        {visible: true, x: 100},
        {visible: false, x: 100},
        {visible: true, x: 300},
      ])
    } finally {
      unregisterToolbarController(controller)
    }
  })

  it('另一个 Tab 展示时替换 owner 与动作，旧 Tab 不能误收起', () => {
    const calls: string[] = []
    showSqlSelectionToolbar(
        'tab-a',
        {selectedText: 'a', x: 1, y: 1, explainSupported: false},
        {run: () => calls.push('a'), explain: () => {}, format: () => {}},
    )
    showSqlSelectionToolbar(
        'tab-b',
        {selectedText: 'b', x: 2, y: 2, explainSupported: false},
        {run: () => calls.push('b'), explain: () => {}, format: () => {}},
    )

    hideSqlSelectionToolbar('tab-a')
    assert.equal(getSqlSelectionToolbarState().visible, true)
    runSqlSelectionToolbarAction('run')
    assert.deepEqual(calls, ['b'])
  })
})
