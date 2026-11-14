<script setup lang="ts">
/**
 * Isolates render failures to a panel/tab. Retry remounts the default slot;
 * optional close emits for workspace tabs. Copy diagnostics for desktop support.
 */
import {onErrorCaptured, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton} from '@datawise/ui'
import DwPanelState from '@/core/components/DwPanelState.vue'
import {writeClipboardText} from '@/shared/browser/app-clipboard'
import {useAppToast} from '@/features/layout/composables/useAppToast'

const props = withDefaults(
  defineProps<{
    /** Soft label for logs (tab type / panel name). */
    label?: string
    /** Show a close action (e.g. workspace tab). */
    closable?: boolean
  }>(),
  {label: 'panel', closable: false},
)

const emit = defineEmits<{
  close: []
}>()

const {t} = useI18n()
const toast = useAppToast()
const failed = ref(false)
const detail = ref('')
const diagnostics = ref('')
const remountKey = ref(0)

watch(
  () => props.label,
  () => {
    // Parent remounted with a different identity — clear stale error.
    failed.value = false
    detail.value = ''
    diagnostics.value = ''
  },
)

onErrorCaptured((err, _instance, info) => {
  failed.value = true
  const message = err instanceof Error ? err.message : String(err ?? '')
  const stack = err instanceof Error ? (err.stack ?? '') : ''
  detail.value = message
  diagnostics.value = `[datawise] panel render error (${props.label})\ninfo=${info ?? ''}\n${
    err instanceof Error ? `${err.name}: ${message}\n${stack}` : String(err ?? '')
  }`.trim()
  console.error(`[datawise] panel render error (${props.label})`, info, err)
  // Stop propagation — main.ts errorHandler would otherwise also toast.
  return false
})

function retry() {
  failed.value = false
  detail.value = ''
  diagnostics.value = ''
  remountKey.value += 1
}

async function copyDiagnostics() {
  const ok = await writeClipboardText(diagnostics.value || detail.value)
}

function onClose() {
  emit('close')
}
</script>

<template>
  <div class="panel-error-boundary">
    <DwPanelState
        v-if="failed"
        status="error"
        fill
        :title="t('common.panelRenderErrorTitle')"
        :message="t('common.vueRenderError')"
        :hint="t('common.panelRenderErrorHint')"
    >
      <template #actions>
        <DwButton variant="secondary" size="sm" @click="retry">
          {{ t('common.reload') }}
        </DwButton>
        <DwButton variant="ghost" size="sm" @click="copyDiagnostics">
          {{ t('common.copyDiagnostics') }}
        </DwButton>
        <DwButton
            v-if="closable"
            variant="ghost"
            size="sm"
            @click="onClose"
        >
          {{ t('common.close') }}
        </DwButton>
      </template>
    </DwPanelState>
    <div v-else :key="remountKey" class="panel-error-boundary__content">
      <slot/>
    </div>
  </div>
</template>

<style scoped>
.panel-error-boundary {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
}

.panel-error-boundary__content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
}
</style>
