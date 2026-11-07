import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {createSpacePanKeyFilter} from '@/core/graph-canvas/utils/graphCanvasKeyScope'

function keyEvent(partial: Record<string, unknown> = {}): KeyboardEvent {
  return {
    code: 'Space',
    key: ' ',
    composedPath: () => [],
    target: null,
    ...partial,
  } as unknown as KeyboardEvent
}

describe('createSpacePanKeyFilter', () => {
  it('allows Space only when page is active and pointer is over the canvas', () => {
    const allow = createSpacePanKeyFilter({
      isPageActive: () => true,
      isPointerOverCanvas: () => true,
    })
    assert.equal(allow(keyEvent()), true)
    assert.equal(allow(keyEvent({code: 'KeyA', key: 'a'})), false)

    assert.equal(createSpacePanKeyFilter({
      isPageActive: () => true,
      isPointerOverCanvas: () => false,
    })(keyEvent()), false)

    assert.equal(createSpacePanKeyFilter({
      isPageActive: () => false,
      isPointerOverCanvas: () => true,
    })(keyEvent()), false)
  })
})
