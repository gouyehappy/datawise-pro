<template>
  <div class="pack-feature-stub">
    <h2 class="pack-feature-stub__title">{{ title }}</h2>
    <p class="pack-feature-stub__body">{{ body }}</p>
    <div class="pack-feature-stub__actions">
      <button
          v-if="!entitled"
          type="button"
          class="pack-feature-stub__cta pack-feature-stub__cta--primary"
          @click="openPaywall"
      >
        {{ t('pack.paywall.ctaUpgrade') }}
      </button>
      <button type="button" class="pack-feature-stub__cta" @click="openStore">
        {{ t('pack.paywall.ctaBrowse') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted} from 'vue'
import {useI18n} from 'vue-i18n'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {packNameKey, packPaywallContextKey} from '@/features/pack/services/pack-i18n'
import type {PackId} from '@/features/pack/types/pack.types'

const props = defineProps<{
    packId: PackId
    context: string
    bodyKey?: string
    /** Use hybrid AI entitlement (pack.ai | pack.ai.offline). */
    ai?: boolean
}>()

const {t, te} = useI18n()
const entitlement = useEntitlementStore()
const layout = useLayoutStore()

const entitled = computed(() =>
    props.ai ? entitlement.isAiUsable() : entitlement.isPackUsable(props.packId),
)

const title = computed(() =>
    entitled.value
        ? t('pack.paywall.standardBuildEntitledTitle', {name: t(packNameKey(props.packId))})
        : t('pack.paywall.lockedTitle', {name: t(packNameKey(props.packId))}),
)

const body = computed(() => {
    if (entitled.value) return t('pack.paywall.standardBuildEntitledHint')
    const key = props.bodyKey ?? packPaywallContextKey(props.context)
    if (te(key)) return `${t(key)} ${t('pack.paywall.standardBuildLockedHint')}`
    return t('pack.paywall.standardBuildLockedHint')
})

onMounted(() => {
    if (entitled.value) return
    // User already dismissed this upsell — keep the stub page, don't trap them.
    if (entitlement.wasPaywallDismissed(props.packId, props.context)) return
    entitlement.openPaywall(props.packId, props.context)
})

function openPaywall() {
    entitlement.openPaywall(props.packId, props.context)
}

function openStore() {
    entitlement.closePaywall()
    layout.setModule('packStore')
}
</script>

<style scoped>
.pack-feature-stub {
  display: grid;
  gap: 0.75rem;
  place-content: center;
  min-height: 40vh;
  padding: 2rem;
  text-align: center;
  color: var(--dw-text-secondary);
}
.pack-feature-stub__title {
  margin: 0;
  font-size: var(--dw-text-lg);
  color: var(--dw-text-primary);
}
.pack-feature-stub__body {
  margin: 0;
  max-width: 28rem;
  line-height: 1.5;
}
.pack-feature-stub__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.pack-feature-stub__cta {
  padding: 0.5rem 1rem;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius);
  background: var(--dw-surface);
  cursor: pointer;
  font-size: var(--dw-text-sm);
  font-weight: 600;
}
.pack-feature-stub__cta--primary {
  border-color: transparent;
  background: var(--dw-primary);
  color: var(--dw-on-accent);
}
</style>
