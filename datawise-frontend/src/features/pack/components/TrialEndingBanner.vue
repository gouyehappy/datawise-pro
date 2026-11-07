<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwInlineAlert} from '@/core/components'
import {listEndingTrials} from '@/features/pack/services/trial-ending'
import {packNameKey} from '@/features/pack/services/pack-i18n'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import type {PackId} from '@/features/pack/types/pack.types'

const DISMISS_KEY = 'dw.pack.trialEnding.dismissed'

const {t} = useI18n()
const entitlement = useEntitlementStore()
const dismissed = ref(false)

watch(
    () => entitlement.ready,
    (ready) => {
        if (!ready || typeof sessionStorage === 'undefined') return
        dismissed.value = sessionStorage.getItem(DISMISS_KEY) === '1'
    },
    {immediate: true},
)

const endingTrials = computed(() => {
    if (entitlement.mode !== 'enforced' || !entitlement.ready) return []
    return listEndingTrials(entitlement.catalogItems)
})

const visible = computed(() => endingTrials.value.length > 0 && !dismissed.value)

const primary = computed(() => endingTrials.value[0] ?? null)

const bannerMessage = computed(() => {
    if (!primary.value) return ''
    const name = t(packNameKey(primary.value.packId))
    if (endingTrials.value.length === 1) {
        return t('pack.trialEnding.single', {
            name,
            days: primary.value.trialDaysLeft,
        })
    }
    return t('pack.trialEnding.multi', {
        name,
        days: primary.value.trialDaysLeft,
        count: endingTrials.value.length,
    })
})

function dismiss() {
    dismissed.value = true
    try {
        sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
        // ignore quota / private mode
    }
}

function renew() {
    if (!primary.value) return
    entitlement.openPaywall(primary.value.packId as PackId, 'trial.ending')
}
</script>

<template>
  <div
      v-if="visible"
      class="trial-ending-banner"
      data-testid="trial-ending-banner"
      role="status"
  >
    <DwInlineAlert density="banner" variant="warning" :message="bannerMessage"/>
    <div class="trial-ending-banner__actions">
      <DwButton variant="primary" size="sm" type="button" @click="renew">
        {{ t('pack.trialEnding.cta') }}
      </DwButton>
      <DwButton variant="ghost" size="sm" type="button" @click="dismiss">
        {{ t('pack.trialEnding.dismiss') }}
      </DwButton>
    </div>
  </div>
</template>

<style scoped>
.trial-ending-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap);
  padding: var(--dw-space-2) var(--dw-space-3);
  margin: 0 var(--dw-panel-gap);
  border: 1px solid var(--dw-border-subtle);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-elevated, var(--dw-bg-panel));
}

.trial-ending-banner__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-space-2);
  margin-left: auto;
}
</style>
