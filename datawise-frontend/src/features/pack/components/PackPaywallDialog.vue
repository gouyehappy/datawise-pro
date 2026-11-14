<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwButton, DwInlineAlert, DwInput, FormField} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {findPackDefinition} from '@/features/pack/catalog/pack-catalog'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useModalFeedback} from '@/core/composables/useModalFeedback'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {
  packCapabilityKey,
  packLayerBlurbKey,
  packLayerNameKey,
  packNameKey,
  packPaywallContextKey,
  packPitchKey,
  suiteNameKey,
  suiteTaglineKey,
} from '@/features/pack/services/pack-i18n'
import {resolvePaywallLayer} from '@/features/pack/services/pack-layer'
import {isStandardEdition} from '@/features/pack/services/is-standard-edition'
import {
  findSuiteDefinition,
  isSuitePaywallContext,
} from '@/features/pack/services/pack-suite-focus'

const entitlement = useEntitlementStore()
const layout = useLayoutStore()
const {t, te} = useI18n()

const open = computed(() => entitlement.paywallPackId != null)
const busy = ref(false)
const showLicenseForm = ref(false)
const licenseKey = ref('')
const {feedback, showError, clearFeedback} = useModalFeedback(open)

const packId = computed(() => entitlement.paywallPackId)

const suiteId = computed(() => {
  const ctx = entitlement.paywallContext
  return isSuitePaywallContext(ctx) ? ctx : null
})

const suiteDef = computed(() => (suiteId.value ? findSuiteDefinition(suiteId.value) : undefined))

const packName = computed(() =>
    packId.value ? t(packNameKey(packId.value)) : '',
)

const headlineName = computed(() =>
    suiteId.value ? t(suiteNameKey(suiteId.value)) : packName.value,
)

const pitch = computed(() => {
  if (suiteId.value) return t(suiteTaglineKey(suiteId.value))
  return packId.value ? t(packPitchKey(packId.value)) : ''
})

const contextHint = computed(() => {
  const ctx = entitlement.paywallContext
  if (!ctx) return ''
  if (isSuitePaywallContext(ctx)) {
    return t(packPaywallContextKey(ctx))
  }
  const known = [
    'nav.ai',
    'console.ai',
    'console.ai.fix',
    'console.ai.explain',
    'console.ai.lite',
    'ai.quota',
    'ai.sqlSuccess',
    'settings.ai',
    'settings.backup',
    'backup.schedule',
    'backup.restore',
    'migration.trial',
    'trial.ending',
    'gov.schema',
    'gov.schema.export',
    'gov.schema.report',
    'gov.crossEnv',
    'gov.crossEnv.preview',
    'gov.crossEnv.report',
    'gov.resultDiff',
    'export.rowCap',
    'ops.explain.pro',
    'dev.productivity',
    'dev.codegen',
    'dev.dml',
    'dev.gridEdit',
    'security.audit.pro',
    'metadoc.enterprise',
    'platform.schema_drift',
    'platform.data_quality',
    'platform.ai',
    'panel.dataops',
    'session.kill',
    'lock.analysis',
  ] as const
  if ((known as readonly string[]).includes(ctx)) {
    return t(packPaywallContextKey(ctx))
  }
  if (ctx.startsWith('connection.')) return t('pack.paywall.context.connection')
  return ''
})

const freeQuotaHint = computed(() => {
  if (packId.value !== 'pack.ai') return ''
  if (entitlement.mode !== 'enforced') return ''
  if (entitlement.isAiUsable()) return ''
  const remaining = entitlement.freeAiCallsRemaining
  const limit = entitlement.freeAiCallsDailyLimit ?? 3
  if (remaining == null) return ''
  return t('pack.paywall.freeQuota', {remaining, limit})
})

/** §1.2 — 30s success sample on AI entry / quota paywall. */
const showAiSample = computed(() => {
  if (suiteId.value) return false
  if (packId.value !== 'pack.ai') return false
  const ctx = entitlement.paywallContext
  return ctx === 'nav.ai' || ctx === 'ai.quota' || ctx === 'ai.sqlSuccess' || ctx == null
})

const paywallLayer = computed(() =>
    resolvePaywallLayer({packId: packId.value, suiteId: suiteId.value}),
)

const layerName = computed(() =>
    paywallLayer.value ? t(packLayerNameKey(paywallLayer.value)) : '',
)

const layerBlurb = computed(() =>
    paywallLayer.value ? t(packLayerBlurbKey(paywallLayer.value)) : '',
)

const title = computed(() => {
  if (layerName.value && headlineName.value) {
    return t('pack.paywall.lockedLayerTitle', {
      layer: layerName.value,
      name: headlineName.value,
    })
  }
  return t('pack.paywall.lockedTitle', {name: headlineName.value})
})

const benefitItems = computed(() => {
  if (suiteDef.value) {
    return suiteDef.value.packIds.map((id) => ({
      key: id,
      label: t(packNameKey(id)),
    }))
  }
  if (!packId.value) return [] as {key: string; label: string}[]
  const def = findPackDefinition(packId.value)
  if (!def) return []
  return def.capabilities.map((cap) => {
    const key = packCapabilityKey(cap)
    return {key: cap, label: te(key) ? t(key) : cap}
  })
})

const benefitsTitle = computed(() =>
    suiteId.value ? t('pack.suite.paywallIncludes') : t('pack.paywall.benefitsTitle'),
)

watch(open, (next) => {
  if (!next) {
    showLicenseForm.value = false
    licenseKey.value = ''
    busy.value = false
    clearFeedback()
  }
})

function close() {
  // Always allow dismiss — busy must not trap the dialog (hanging trial/activate).
  busy.value = false
  entitlement.closePaywall()
}

function goStore() {
  close()
  layout.setModule('packStore')
}

function notifyStandardBuildIfNeeded() {
  if (!isStandardEdition()) return
}

async function onTrial() {
  if (!packId.value || busy.value) return
  busy.value = true
  clearFeedback()
  try {
    await entitlement.startTrial(packId.value)
    notifyStandardBuildIfNeeded()
  } catch (error) {
    showError(resolveErrorMessage(error))
  } finally {
    busy.value = false
  }
}

async function onClaimSitePro() {
  if (busy.value) return
  busy.value = true
  clearFeedback()
  try {
    await entitlement.claimSiteProTrial()
    notifyStandardBuildIfNeeded()
  } catch (error) {
    showError(resolveErrorMessage(error))
  } finally {
    busy.value = false
  }
}

async function onActivate() {
  const key = licenseKey.value.trim()
  if (!key || busy.value) return
  busy.value = true
  clearFeedback()
  try {
    await entitlement.activateLicense(key)
    notifyStandardBuildIfNeeded()
  } catch (error) {
    showError(resolveErrorMessage(error))
  } finally {
    busy.value = false
  }
}

function resolveErrorMessage(error: unknown): string {
  return resolveCaughtApiErrorMessage(error, t, 'pack.paywall.actionFailed')
}
</script>

<template>
  <AppModal
      :open="open"
      :title="title"
      :subtitle="t('pack.paywall.subtitle')"
      width="480px"
      max-height="min(90vh, 720px)"
      close-on-backdrop
      @close="close"
  >
    <div class="pack-paywall">
      <DwInlineAlert
          v-if="feedback"
          density="banner"
          :variant="feedback.variant"
          :message="feedback.message"
      />

      <DwInlineAlert
          v-if="entitlement.mode === 'open'"
          density="banner"
          variant="info"
          :message="t('pack.paywall.modeOpenNote')"
      />

      <DwInlineAlert
          v-if="contextHint"
          density="banner"
          variant="warning"
          :message="contextHint"
      />

      <DwInlineAlert
          v-if="freeQuotaHint"
          density="banner"
          variant="info"
          :message="freeQuotaHint"
      />

      <DwInlineAlert
          v-if="entitlement.siteProTrialAvailable"
          density="banner"
          variant="info"
          :message="t('pack.paywall.siteProTrialHint', {days: entitlement.siteProTrialDays ?? 7})"
      />

      <div class="pack-paywall__hero">
        <div class="pack-paywall__icon" aria-hidden="true">
          <DwIcon name="zap" size="xl" :stroke-width="1.7"/>
        </div>
        <div class="pack-paywall__hero-copy">
          <p v-if="layerName" class="pack-paywall__layer">
            {{ t('pack.paywall.layerEyebrow', {layer: layerName}) }}
          </p>
          <p v-if="layerBlurb" class="pack-paywall__layer-blurb">{{ layerBlurb }}</p>
          <p class="pack-paywall__pitch">{{ pitch }}</p>
        </div>
      </div>

      <section v-if="showAiSample" class="pack-paywall__sample" aria-label="AI success sample">
        <p class="pack-paywall__sample-eyebrow">{{ t('pack.paywall.sampleTitle') }}</p>
        <p class="pack-paywall__sample-prompt">{{ t('pack.paywall.samplePrompt') }}</p>
        <pre class="pack-paywall__sample-sql">{{ t('pack.paywall.sampleSql') }}</pre>
        <p class="pack-paywall__sample-caption">{{ t('pack.paywall.sampleCaption') }}</p>
      </section>

      <div v-if="benefitItems.length" class="pack-paywall__benefits">
        <p class="pack-paywall__benefits-title">{{ benefitsTitle }}</p>
        <ul>
          <li v-for="item in benefitItems" :key="item.key">
            <DwIcon name="check" size="sm" :stroke-width="2"/>
            <span>{{ item.label }}</span>
          </li>
        </ul>
      </div>

      <FormField
          v-if="showLicenseForm"
          class="pack-paywall__license"
          :label="t('pack.paywall.licenseLabel')"
      >
        <template #default="{ id }">
          <DwInput
              :id="id"
              v-model="licenseKey"
              class="pack-paywall__license-input"
              :rows="3"
              :placeholder="t('pack.paywall.licensePlaceholder')"
              :disabled="busy"
              :spellcheck="false"
          />
        </template>
      </FormField>

      <p class="pack-paywall__footprint">{{ t('pack.paywall.footprint') }}</p>
    </div>

    <template #footer>
      <DwButton variant="ghost" :disabled="busy" @click="close">
        {{ t('pack.paywall.ctaClose') }}
      </DwButton>
      <DwButton variant="secondary" :disabled="busy" @click="goStore">
        {{ t('pack.paywall.ctaBrowse') }}
      </DwButton>
      <DwButton
          v-if="!showLicenseForm"
          variant="secondary"
          :disabled="busy || !packId"
          @click="showLicenseForm = true"
      >
        {{ t('pack.paywall.ctaLicense') }}
      </DwButton>
      <DwButton
          v-if="entitlement.siteProTrialAvailable && !showLicenseForm"
          variant="primary"
          :disabled="busy"
          @click="onClaimSitePro"
      >
        {{ t('pack.paywall.ctaSiteProTrial', {days: entitlement.siteProTrialDays ?? 7}) }}
      </DwButton>
      <DwButton
          v-else-if="!showLicenseForm"
          variant="primary"
          :disabled="busy || !packId"
          @click="onTrial"
      >
        {{ t('pack.paywall.ctaTrial') }}
      </DwButton>
      <DwButton
          v-if="showLicenseForm"
          variant="primary"
          :disabled="busy || !licenseKey.trim()"
          @click="onActivate"
      >
        {{ t('pack.paywall.ctaActivate') }}
      </DwButton>
    </template>
  </AppModal>
</template>

<style scoped>
.pack-paywall {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-4);
  min-height: 0;
  overflow-y: auto;
}

.pack-paywall__hero {
  display: flex;
  gap: var(--dw-space-4);
  align-items: flex-start;
  padding: var(--dw-space-4);
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-primary) 8%, var(--dw-surface));
}

.pack-paywall__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--dw-density-lg);
  height: var(--dw-density-lg);
  border-radius: var(--dw-control-radius);
  flex-shrink: 0;
  color: var(--dw-primary);
  background: color-mix(in srgb, var(--dw-primary) 14%, transparent);
}

.pack-paywall__hero-copy {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
  min-width: 0;
}

.pack-paywall__layer {
  margin: 0;
  font-size: var(--dw-text-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dw-primary);
}

.pack-paywall__layer-blurb {
  margin: 0;
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
  color: var(--dw-text-muted);
}

.pack-paywall__pitch {
  margin: 0;
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading);
  color: var(--dw-text-secondary);
}

.pack-paywall__sample {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
  padding: var(--dw-space-4);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-bg-panel) 88%, var(--dw-bg));
  animation: pack-paywall-sample-in 420ms var(--dw-ease) both;
}

.pack-paywall__sample-eyebrow {
  margin: 0;
  font-size: var(--dw-text-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dw-primary);
}

.pack-paywall__sample-prompt {
  margin: 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
}

.pack-paywall__sample-sql {
  margin: 0;
  padding: var(--dw-space-3);
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-text) 4%, transparent);
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-loose);
  color: var(--dw-text);
  white-space: pre-wrap;
  overflow: hidden;
  animation: pack-paywall-sql-reveal 1.2s var(--dw-ease) 180ms both;
}

.pack-paywall__sample-caption {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

@keyframes pack-paywall-sample-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pack-paywall-sql-reveal {
  from {
    opacity: 0.35;
    max-height: 2.5rem;
  }
  to {
    opacity: 1;
    max-height: 8rem;
  }
}

.pack-paywall__benefits-title {
  margin: 0 0 var(--dw-space-2);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--dw-text-muted);
  text-transform: uppercase;
}

.pack-paywall__benefits ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
}

.pack-paywall__benefits li {
  display: flex;
  align-items: center;
  gap: var(--dw-space-2);
  font-size: var(--dw-text-sm);
  color: var(--dw-text);
  font-family: var(--dw-mono);
}

.pack-paywall__benefits li :deep(svg) {
  color: var(--dw-success);
  flex-shrink: 0;
}

.pack-paywall__license {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
}

.pack-paywall__license-input,
.pack-paywall__license :deep(textarea) {
  width: 100%;
  resize: vertical;
  min-height: 72px;
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}

.pack-paywall__footprint {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}
</style>
