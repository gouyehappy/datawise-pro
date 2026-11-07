<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon, type DwIconName} from '@/core/icons'
import {DwButton, StatusPill} from '@/core/components'
import type {PackCatalogItem} from '@/features/pack/types/pack.types'
import {PACK_AI_OFFLINE_ID} from '@/features/pack/types/pack.types'
import type {StatusVariant} from '@/core/utils/status-variant'
import {packHighlightKey, packNameKey, packPitchKey} from '@/features/pack/services/pack-i18n'

const props = defineProps<{
  pack: PackCatalogItem
}>()

const emit = defineEmits<{
  open: [packId: PackCatalogItem['id']]
  upgrade: [packId: PackCatalogItem['id']]
}>()

const {t} = useI18n()

const name = computed(() => t(packNameKey(props.pack.id)))
const pitch = computed(() => t(packPitchKey(props.pack.id)))
const highlight = computed(() => t(packHighlightKey(props.pack.id)))

const stateLabel = computed(() => t(`pack.state.${props.pack.state}`))

const isLocked = computed(
    () => props.pack.state === 'locked' || props.pack.state === 'expired',
)

const pillVariant = computed<StatusVariant>(() => {
  switch (props.pack.state) {
    case 'active':
      return 'success'
    case 'trial':
      return 'info'
    case 'expired':
      return 'error'
    case 'not_installed':
      return 'warn'
    default:
      return 'neutral'
  }
})

const iconName = computed<DwIconName>(() => {
  if (props.pack.id === 'pack.ai' || props.pack.id === PACK_AI_OFFLINE_ID) return 'ai'
  if (props.pack.id === 'pack.migration') return 'migration'
  if (props.pack.id === 'pack.backup') return 'save'
  if (props.pack.id === 'pack.dataops') return 'monitor'
  if (props.pack.id === 'pack.security') return 'lock'
  if (props.pack.category === 'connector') return 'database'
  return 'layers'
})

const toneClass = computed(() => `pack-card--${props.pack.tone}`)

function onPrimary() {
  if (isLocked.value) {
    emit('upgrade', props.pack.id)
    return
  }
  emit('open', props.pack.id)
}
</script>

<template>
  <article
      class="pack-card"
      :class="[toneClass, {
        'pack-card--featured': pack.featured,
        'pack-card--locked': isLocked,
      }]"
  >
    <div class="pack-card__glow" aria-hidden="true"/>
    <header class="pack-card__head">
      <div class="pack-card__icon" aria-hidden="true">
        <DwIcon :name="iconName" size="rail" :stroke-width="1.7"/>
      </div>
      <StatusPill :variant="pillVariant">{{ stateLabel }}</StatusPill>
    </header>

    <h3 class="pack-card__title">{{ name }}</h3>
    <p class="pack-card__pitch">{{ pitch }}</p>
    <p class="pack-card__highlight">{{ highlight }}</p>

    <footer class="pack-card__foot">
      <DwButton
          :variant="isLocked ? 'primary' : 'ghost'"
          type="button"
          @click="onPrimary"
      >
        {{ isLocked ? t('pack.actions.upgrade') : t('pack.actions.open') }}
      </DwButton>
    </footer>
  </article>
</template>
