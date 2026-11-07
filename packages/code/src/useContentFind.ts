import {computed, ref, toValue, watch, type MaybeRefOrGetter} from 'vue'

export type ContentFindMatchState = 'idle' | 'match' | 'no-match'

/**
 * Line-oriented find helper for text viewers (logs, code dumps).
 * Match indexes are source-line positions; the consumer decides whether to
 * filter the view or only highlight/navigate.
 */
export function useContentFind(options: {
  lines: MaybeRefOrGetter<readonly string[]>
  query: MaybeRefOrGetter<string>
}) {
  /** 0-based index into `matchIndexes`; -1 when there is no active match. */
  const activeOrdinal = ref(-1)

  const normalizedQuery = computed(() => toValue(options.query).trim())

  const matchIndexes = computed(() => {
    const needle = normalizedQuery.value.toLowerCase()
    const lines = toValue(options.lines)
    if (!needle) return [] as number[]
    const matched: number[] = []
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.toLowerCase().includes(needle)) matched.push(i)
    }
    return matched
  })

  const matchCount = computed(() => matchIndexes.value.length)

  const matchState = computed<ContentFindMatchState>(() => {
    if (!normalizedQuery.value) return 'idle'
    return matchCount.value > 0 ? 'match' : 'no-match'
  })

  /** 1-based index for UI (`0` when idle / no match). */
  const resultIndex = computed(() => {
    if (matchState.value !== 'match' || activeOrdinal.value < 0) return 0
    return activeOrdinal.value + 1
  })

  const activeSourceIndex = computed(() => {
    if (activeOrdinal.value < 0) return -1
    return matchIndexes.value[activeOrdinal.value] ?? -1
  })

  function clampActive() {
    const count = matchCount.value
    if (count === 0) {
      activeOrdinal.value = -1
      return
    }
    if (activeOrdinal.value < 0 || activeOrdinal.value >= count) {
      activeOrdinal.value = 0
    }
  }

  function findNext() {
    const count = matchCount.value
    if (count === 0) {
      activeOrdinal.value = -1
      return -1
    }
    activeOrdinal.value = activeOrdinal.value < 0 ? 0 : (activeOrdinal.value + 1) % count
    return activeSourceIndex.value
  }

  function findPrevious() {
    const count = matchCount.value
    if (count === 0) {
      activeOrdinal.value = -1
      return -1
    }
    activeOrdinal.value =
      activeOrdinal.value < 0 ? count - 1 : (activeOrdinal.value - 1 + count) % count
    return activeSourceIndex.value
  }

  function reset() {
    activeOrdinal.value = -1
  }

  watch(
    [normalizedQuery, matchIndexes],
    () => {
      if (!normalizedQuery.value) {
        activeOrdinal.value = -1
        return
      }
      clampActive()
    },
    {flush: 'sync', immediate: true},
  )

  return {
    matchIndexes,
    matchCount,
    matchState,
    resultIndex,
    activeOrdinal,
    activeSourceIndex,
    findNext,
    findPrevious,
    reset,
  }
}
