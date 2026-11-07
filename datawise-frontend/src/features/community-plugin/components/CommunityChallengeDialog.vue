<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwCheckbox, ModalActions} from '@/core/components'
import type {ConnectionChallenge} from '@/features/community-plugin/lib/runCommunityPluginConnectionTest'

const props = defineProps<{
    open: boolean
    pluginId: string
    challenge: ConnectionChallenge | null
}>()

const emit = defineEmits<{
    resolve: [decision: {accept: boolean; remember: boolean}]
    'update:open': [value: boolean]
}>()

const {t} = useI18n()
const remember = ref(true)

watch(
    () => props.open,
    (open) => {
        if (open) remember.value = true
    },
)

const kindLabel = computed(() => (props.challenge?.kind || 'host-key').trim() || 'host-key')
const remote = computed(() =>
    props.challenge ? `${props.challenge.host}:${props.challenge.port}` : '',
)

function resolve(accept: boolean) {
    emit('resolve', {accept, remember: accept && remember.value})
    emit('update:open', false)
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('communityPlugin.challenge.title')"
      width="460px"
      @close="resolve(false)"
  >
    <div v-if="challenge" class="challenge-dialog">
      <p class="challenge-dialog__intro">
        {{ t('communityPlugin.challenge.intro', {kind: kindLabel, remote}) }}
      </p>
      <dl class="challenge-dialog__facts">
        <template v-if="challenge.keyType">
          <dt>{{ t('communityPlugin.challenge.keyType') }}</dt>
          <dd>{{ challenge.keyType }}</dd>
        </template>
        <template v-if="challenge.fingerprint">
          <dt>{{ t('communityPlugin.challenge.fingerprint') }}</dt>
          <dd class="challenge-dialog__mono">{{ challenge.fingerprint }}</dd>
        </template>
      </dl>
      <p v-if="challenge.fingerprint" class="challenge-dialog__hint">
        {{ t('communityPlugin.challenge.verifyHint') }}
      </p>
      <DwCheckbox
          v-model="remember"
          :label="t('communityPlugin.challenge.remember')"
      />
    </div>
    <template #footer>
      <ModalActions
          :cancel-label="t('communityPlugin.challenge.reject')"
          :confirm-label="t('communityPlugin.challenge.accept')"
          @cancel="resolve(false)"
          @confirm="resolve(true)"
      />
    </template>
  </AppModal>
</template>

<style scoped>
.challenge-dialog {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.challenge-dialog__intro {
    margin: 0;
    color: var(--dw-text);
    font-size: var(--dw-text-sm);
}

.challenge-dialog__facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.25rem 1rem;
    margin: 0;
}

.challenge-dialog__facts dt {
    color: var(--dw-text-muted);
    font-size: var(--dw-text-xs);
}

.challenge-dialog__facts dd {
    margin: 0;
    font-size: var(--dw-text-xs);
}

.challenge-dialog__mono {
    font-family: var(--dw-font-mono, ui-monospace, monospace);
    word-break: break-all;
}

.challenge-dialog__hint {
    margin: 0;
    color: var(--dw-text-muted);
    font-size: var(--dw-text-xs);
}
</style>
