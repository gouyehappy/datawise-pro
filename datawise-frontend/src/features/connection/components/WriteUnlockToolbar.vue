<script setup lang="ts">
/**
 * T-SAFE-1：连接开启 writeGuard 时，控制台工具条提供 1/5 分钟临时解锁。
 */
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import IconButton from '@/core/components/IconButton.vue'
import {
  clearWriteUnlock,
  fetchWriteUnlockStatus,
  requestWriteUnlock,
  type WriteUnlockStatus,
} from '@/features/connection/services/write-unlock.api'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {useAppToast} from '@/features/layout/composables/useAppToast'

const props = defineProps<{
  connectionId?: string | null
  /** 连接配置上的 writeGuard；未开则整块不渲染 */
  writeGuard?: boolean
}>()

const {t} = useI18n()
const toast = useAppToast()
const status = ref<WriteUnlockStatus | null>(null)
const busy = ref(false)
let tickTimer: ReturnType<typeof setInterval> | null = null

const remainingLabel = computed(() => {
  const sec = status.value?.remainingSec ?? 0
  if (sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
})

async function refresh() {
  if (!props.connectionId || !props.writeGuard) {
    status.value = null
    return
  }
  status.value = await fetchWriteUnlockStatus(props.connectionId)
}

async function unlock(durationSec: 60 | 300) {
  if (!props.connectionId || busy.value) return
  busy.value = true
  try {
    status.value = await requestWriteUnlock(props.connectionId, durationSec)
  } catch (err) {
    toast.error(resolveCaughtApiErrorMessage(err, t('connection.writeUnlockFailed')))
  } finally {
    busy.value = false
  }
}

async function endUnlock() {
  if (!props.connectionId || busy.value) return
  busy.value = true
  try {
    await clearWriteUnlock(props.connectionId)
    status.value = null
  } catch (err) {
    toast.error(resolveCaughtApiErrorMessage(err, t('connection.writeUnlockFailed')))
  } finally {
    busy.value = false
  }
}

watch(
  () => [props.connectionId, props.writeGuard] as const,
  () => {
    void refresh()
  },
)

function onPageHide() {
  // Best-effort teardown so unlock windows do not outlive the browser tab (T-SAFE-1).
  if (!props.connectionId || !status.value) return
  void clearWriteUnlock(props.connectionId).catch(() => undefined)
}

onMounted(() => {
  void refresh()
  window.addEventListener('pagehide', onPageHide)
  tickTimer = setInterval(() => {
    if (!status.value) return
    const next = Math.max(0, (status.value.remainingSec ?? 0) - 1)
    if (next <= 0) {
      status.value = null
      return
    }
    status.value = {...status.value, remainingSec: next}
  }, 1000)
})

onBeforeUnmount(() => {
  window.removeEventListener('pagehide', onPageHide)
  if (tickTimer) clearInterval(tickTimer)
})
</script>

<template>
  <div v-if="writeGuard && connectionId" class="write-unlock-toolbar">
    <template v-if="status && status.remainingSec > 0">
      <span class="write-unlock-toolbar__timer" :title="t('connection.writeUnlockActiveHint')">
        {{ t('connection.writeUnlockActive', {time: remainingLabel}) }}
      </span>
      <IconButton
          :title="t('connection.writeUnlockEnd')"
          :disabled="busy"
          @click="endUnlock"
      >
        {{ t('connection.writeUnlockEnd') }}
      </IconButton>
    </template>
    <template v-else>
      <IconButton
          :title="t('connection.writeUnlock1m')"
          :disabled="busy"
          @click="unlock(60)"
      >
        {{ t('connection.writeUnlock1m') }}
      </IconButton>
      <IconButton
          :title="t('connection.writeUnlock5m')"
          :disabled="busy"
          @click="unlock(300)"
      >
        {{ t('connection.writeUnlock5m') }}
      </IconButton>
    </template>
  </div>
</template>

<style scoped>
.write-unlock-toolbar {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-1);
}
.write-unlock-toolbar__timer {
  font-size: var(--dw-text-xs);
  color: var(--dw-warning);
  white-space: nowrap;
}
</style>
