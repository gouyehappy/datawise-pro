<script setup lang="ts">
import {ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {explorerApi} from '@/api'
import {DwButton, DwInlineAlert, DwInput} from '@/core/components'
import {usePageLocalEventListener} from '@/core/composables/usePageLocalEventListener'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = defineProps<{
  connectionId: string
  topic: string
}>()

const emit = defineEmits<{
  produced: []
}>()

const {t} = useI18n()
const layout = useLayoutStore()

const key = ref('')
const value = ref('')
const partition = ref('')
const sending = ref(false)
const error = ref<string | null>(null)

function applySeed(payload?: { key?: string; value?: string; partition?: number }) {
  if (!payload) return
  if (payload.key != null) key.value = payload.key
  if (payload.value != null) value.value = payload.value
  if (payload.partition != null) partition.value = String(payload.partition)
}

async function onSubmit() {
  if (!props.connectionId || !props.topic || !value.value.trim()) return
  sending.value = true
  error.value = null
  try {
    const partitionNumber = partition.value.trim() === '' ? undefined : Number(partition.value)
    const result = await explorerApi.produceKafkaMessage(props.connectionId, props.topic, {
      key: key.value || undefined,
      value: value.value,
      partition: Number.isFinite(partitionNumber) ? partitionNumber : undefined,
    })
    layout.showSuccessToast(t('explorer.kafkaProducer.success', {
      partition: result.partition,
      offset: result.offset,
    }))
    value.value = ''
    emit('produced')
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.kafkaProducer.failed')
  } finally {
    sending.value = false
  }
}

function onKeydown(event: Event) {
  const e = event as KeyboardEvent
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    void onSubmit()
  }
}

watch(
    () => props.topic,
    () => {
      error.value = null
    },
)

usePageLocalEventListener(window, 'keydown', onKeydown)

defineExpose({applySeed})
</script>

<template>
  <form class="kafka-producer-panel" @submit.prevent="onSubmit">
    <div class="kafka-producer-panel__scroll">
      <p class="kafka-producer-panel__hint">{{ t('explorer.kafkaProducer.hint', {topic}) }}</p>

      <div class="kafka-producer-panel__row">
        <label class="kafka-producer-panel__field">
          <span>{{ t('explorer.kafkaProducer.key') }}</span>
          <DwInput
              v-model="key"
              variant="sm"
              type="text"
              :spellcheck="false"
              :placeholder="t('explorer.kafkaProducer.keyOptional')"
          />
        </label>
        <label class="kafka-producer-panel__field kafka-producer-panel__field--partition">
          <span>{{ t('explorer.kafkaProducer.partition') }}</span>
          <DwInput
              v-model="partition"
              variant="sm"
              type="text"
              inputmode="numeric"
              :placeholder="t('explorer.kafkaProducer.partitionOptional')"
          />
        </label>
      </div>

      <label class="kafka-producer-panel__field">
        <span>{{ t('explorer.kafkaProducer.value') }}</span>
        <DwInput
            v-model="value"
            :rows="3"
            :spellcheck="false"
            :placeholder="t('explorer.kafkaProducer.valuePlaceholder')"
        />
      </label>
    </div>

    <footer class="kafka-producer-panel__footer">
      <DwInlineAlert v-if="error" class="kafka-producer-panel__feedback" :message="error"/>
      <DwInlineAlert v-else class="kafka-producer-panel__feedback" variant="info" :message="t('explorer.kafkaProducer.shortcut')"/>
      <DwButton
          variant="primary"
          size="sm"
          type="submit"
          :disabled="sending || !value.trim()"
      >
        {{ sending ? t('explorer.kafkaProducer.sending') : t('explorer.kafkaProducer.send') }}
      </DwButton>
    </footer>
  </form>
</template>

<style scoped>
.kafka-producer-panel {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.kafka-producer-panel__scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
}

.kafka-producer-panel__hint {
  margin: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}

.kafka-producer-panel__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px;
  gap: var(--dw-gap);
}

.kafka-producer-panel__field {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
  min-width: 0;
  font-size: var(--dw-text-xs);
  font-weight: 600;
  color: var(--dw-text-muted);
}

.kafka-producer-panel__field textarea.dw-input {
  min-height: var(--dw-density-xl);
  max-height: none;
  height: auto;
  padding: var(--dw-pad-control);
  font-family: var(--dw-font-mono);
  resize: vertical;
  line-height: var(--dw-leading-relaxed);
}

.kafka-producer-panel__field .dw-input {
  font-family: var(--dw-font-mono);
}

.kafka-producer-panel__footer {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  flex-shrink: 0;
  padding-top: var(--dw-space-1);
  border-top: 1px solid var(--dw-border);
}

.kafka-producer-panel__feedback {
  flex: 1;
  min-width: 0;
}

@media (max-width: 720px) {
  .kafka-producer-panel__row {
    grid-template-columns: 1fr;
  }

  .kafka-producer-panel__footer {
    flex-wrap: wrap;
  }
}
</style>
