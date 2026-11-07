import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {ref} from 'vue'
import {useContentFind} from '@/core/composables/useContentFind'

describe('useContentFind', () => {
  it('matches lines case-insensitively and cycles next/previous', () => {
    const lines = ref(['alpha', 'Beta error', 'gamma', 'error again'])
    const query = ref('ERROR')
    const find = useContentFind({lines, query})

    assert.equal(find.matchState.value, 'match')
    assert.equal(find.matchCount.value, 2)
    assert.deepEqual(find.matchIndexes.value, [1, 3])
    assert.equal(find.resultIndex.value, 1)
    assert.equal(find.activeSourceIndex.value, 1)

    assert.equal(find.findNext(), 3)
    assert.equal(find.resultIndex.value, 2)
    assert.equal(find.findNext(), 1)
    assert.equal(find.resultIndex.value, 1)
    assert.equal(find.findPrevious(), 3)
    assert.equal(find.resultIndex.value, 2)
  })

  it('reports no-match and resets when query clears', () => {
    const lines = ref(['one', 'two'])
    const query = ref('zzz')
    const find = useContentFind({lines, query})

    assert.equal(find.matchState.value, 'no-match')
    assert.equal(find.matchCount.value, 0)
    assert.equal(find.findNext(), -1)

    query.value = ''
    assert.equal(find.matchState.value, 'idle')
    assert.equal(find.resultIndex.value, 0)
    assert.equal(find.activeSourceIndex.value, -1)
  })
})
