import {computed, ref, toValue, watch, type MaybeRefOrGetter} from 'vue'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function readRaw(key: string | undefined): number | null {
  if (!key || typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeRaw(key: string | undefined, value: number) {
  if (!key || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, String(value))
  } catch {
    /* ignore */
  }
}

export function usePersistedSplitWidth(options: {
  key?: MaybeRefOrGetter<string | undefined>
  defaultWidth: MaybeRefOrGetter<number>
  min: MaybeRefOrGetter<number>
  max: MaybeRefOrGetter<number>
}) {
  const stored = readRaw(toValue(options.key))
  const userPinned = ref(stored != null)

  const width = ref(
    clamp(
      stored ?? toValue(options.defaultWidth),
      toValue(options.min),
      Math.max(toValue(options.min), toValue(options.max)),
    ),
  )

  watch(
    () =>
      [toValue(options.key), toValue(options.defaultWidth), toValue(options.min), toValue(options.max)] as const,
    ([key, fallback, min, max]) => {
      const cap = Math.max(min, max)
      if (userPinned.value) {
        const again = readRaw(key)
        width.value = clamp(again ?? width.value, min, cap)
        return
      }
      width.value = clamp(fallback, min, cap)
    },
  )

  const bounded = computed({
    get: () =>
      clamp(width.value, toValue(options.min), Math.max(toValue(options.min), toValue(options.max))),
    set: (next: number) => {
      const min = toValue(options.min)
      const max = Math.max(min, toValue(options.max))
      const clamped = clamp(next, min, max)
      userPinned.value = true
      width.value = clamped
      writeRaw(toValue(options.key), clamped)
    },
  })

  return {width: bounded}
}
