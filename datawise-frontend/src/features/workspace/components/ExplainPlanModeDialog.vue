<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, ModalActions} from '@/core/components'
import PillSelect from '@/core/components/PillSelect.vue'
import type {ExplainPlanMode} from '@/features/workspace/types/explain-plan'

const props = defineProps<{
  open: boolean
  analyzeSupported: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [mode: ExplainPlanMode]
}>()

const {t} = useI18n()
const mode = ref<ExplainPlanMode>('estimate')

const modeLabels = computed(() => ({
  estimate: t('console.explainMode.estimate'),
  analyze: t('console.explainMode.analyze'),
}))

const modeOptions = computed(() => [
  modeLabels.value.estimate,
  ...(props.analyzeSupported ? [modeLabels.value.analyze] : []),
])

const modeModel = computed({
  get: () => modeLabels.value[mode.value],
  set: (label: string) => {
    mode.value = label === modeLabels.value.analyze ? 'analyze' : 'estimate'
  },
})

watch(
    () => props.open,
    (isOpen) => {
      if (!isOpen) return
      mode.value = 'estimate'
    },
)

function close() {
  emit('update:open', false)
}

function submit() {
  emit('confirm', mode.value)
  close()
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('console.explainMode.title')"
      :subtitle="t('console.explainMode.subtitle')"
      width="440px"
      @close="close"
  >
    <div class="modal-form modal-form--compact">
      <PillSelect v-model="modeModel" :options="modeOptions"/>
      <p v-if="mode === 'analyze'" class="modal-warn-box">
        {{ t('console.explainMode.analyzeWarning') }}
      </p>
      <p v-else class="modal-body-hint">
        {{ t('console.explainMode.estimateHint') }}
      </p>
      <p v-if="!analyzeSupported" class="modal-body-hint">
        {{ t('console.explainMode.analyzeUnsupported') }}
      </p>
    </div>

    <template #footer>
      <ModalActions
          :cancel-label="t('common.cancel')"
          :confirm-label="t('console.explainMode.run')"
          @cancel="close"
          @confirm="submit"
      />
    </template>
  </AppModal>
</template>
