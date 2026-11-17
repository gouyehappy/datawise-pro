import {computed, onBeforeUnmount, ref, watch, type Ref} from 'vue'
import {formatDurationMs} from '@/features/workspace/services/sql-stats.service'

/** Elapsed timer while a console query is running (toolbar + result pane). */
export function useConsoleRunningElapsed(running: Ref<boolean>) {
  const runningElapsedMs = ref(0)
  let runningElapsedTimer: ReturnType<typeof setInterval> | null = null

  watch(running, (isRunning) => {
    if (runningElapsedTimer) {
      clearInterval(runningElapsedTimer)
      runningElapsedTimer = null
    }
    if (!isRunning) {
      runningElapsedMs.value = 0
      return
    }
    const startedAt = Date.now()
    runningElapsedMs.value = 0
    runningElapsedTimer = setInterval(() => {
      runningElapsedMs.value = Date.now() - startedAt
    }, 200)
  })

  onBeforeUnmount(() => {
    if (runningElapsedTimer) {
      clearInterval(runningElapsedTimer)
      runningElapsedTimer = null
    }
  })

  const runningElapsedLabel = computed(() =>
    running.value ? formatDurationMs(runningElapsedMs.value) : '',
  )

  return {runningElapsedMs, runningElapsedLabel}
}
