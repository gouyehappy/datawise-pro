<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {EmptyState, DwButton, DwInlineAlert} from '@/core/components'
import {DwIcon} from '@/core/icons'
import SearchInput from '@/core/components/SearchInput.vue'
import DwSelect from '@/core/components/DwSelect.vue'
import type {SelectOption} from '@/core/components/select.types'
import PackCard from '@/features/pack/components/PackCard.vue'
import PackAuditPanel from '@/features/pack/components/PackAuditPanel.vue'
import {
    isSuiteRecommendedForPersona,
    orderSuitesForPersona,
    PACK_STORE_PERSONAS,
    type PackStorePersona,
} from '@/features/pack/services/pack-store-persona'
import {
  resolveSuitePaywallTarget,
  suitePackUsableChecker,
  suiteProgress,
} from '@/features/pack/services/pack-suite-focus'
import {SUITE_CATALOG} from '@/features/pack/catalog/pack-catalog'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import type {PackId, SuiteId} from '@/features/pack/types/pack.types'
import {packNameKey, packPitchKey, suiteNameKey, suiteTaglineKey} from '@/features/pack/services/pack-i18n'
import {useLayoutStore} from '@/features/layout/stores/layout'
import '@/features/pack/styles/pack-store.css'

const emit = defineEmits<{
  manageSwitches: []
}>()

const {t} = useI18n()
const entitlement = useEntitlementStore()
const auth = useAuthStore()
const layout = useLayoutStore()

type StoreFilter = 'all' | 'capability' | 'connector' | 'locked' | 'active'

const filter = ref<StoreFilter>('all')
const searchQuery = ref('')
const persona = ref<PackStorePersona>('general')
const claimingSitePro = ref(false)

async function onClaimSitePro() {
  if (claimingSitePro.value) return
  claimingSitePro.value = true
  try {
    await entitlement.claimSiteProTrial()
  } finally {
    claimingSitePro.value = false
  }
}

const filters: {id: StoreFilter; labelKey: string}[] = [
  {id: 'all', labelKey: 'pack.filter.all'},
  {id: 'capability', labelKey: 'pack.filter.capability'},
  {id: 'connector', labelKey: 'pack.filter.connector'},
  {id: 'locked', labelKey: 'pack.filter.locked'},
  {id: 'active', labelKey: 'pack.filter.active'},
]

const personaOptions = computed<SelectOption[]>(() =>
  PACK_STORE_PERSONAS.map((id) => ({
    value: id,
    label: t(`pack.persona.${id}`),
  })),
)

const suitesForPersona = computed(() => orderSuitesForPersona(persona.value))

const suiteUsable = computed(() =>
  suitePackUsableChecker(entitlement.mode, (id) => entitlement.isPackUsable(id)),
)

const suiteProgressById = computed(() => {
  const map = new Map<SuiteId, ReturnType<typeof suiteProgress>>()
  const usable = suiteUsable.value
  for (const suite of SUITE_CATALOG) {
    map.set(suite.id, suiteProgress(suite, usable))
  }
  return map
})

const showFreeAiStat = computed(() =>
    entitlement.mode === 'enforced'
    && !entitlement.isAiUsable()
    && entitlement.freeAiCallsRemaining != null,
)

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return entitlement.catalogItems.filter((pack) => {
    if (filter.value === 'capability' && pack.category !== 'capability') return false
    if (filter.value === 'connector' && pack.category !== 'connector') return false
    if (filter.value === 'locked' && pack.state !== 'locked' && pack.state !== 'expired') return false
    if (filter.value === 'active' && pack.state !== 'active' && pack.state !== 'trial') return false
    if (!q) return true
    const name = t(packNameKey(pack.id)).toLowerCase()
    const pitch = t(packPitchKey(pack.id)).toLowerCase()
    return name.includes(q) || pitch.includes(q) || pack.id.includes(q)
  })
})

const capabilityItems = computed(() =>
    filtered.value.filter((pack) => pack.category === 'capability'),
)
const connectorItems = computed(() =>
    filtered.value.filter((pack) => pack.category === 'connector'),
)

function onUpgrade(packId: PackId) {
  entitlement.openPaywall(packId, 'store')
}

function onOpen(packId: PackId) {
  if (!entitlement.isPackUsable(packId)) {
    entitlement.openPaywall(packId, 'store')
    return
  }
  emit('manageSwitches')
}

function suiteCardProgress(suiteId: SuiteId) {
  return suiteProgressById.value.get(suiteId) ?? null
}

function suiteMetaLabel(suiteId: SuiteId): string {
  const progress = suiteCardProgress(suiteId)
  if (!progress) return ''
  if (entitlement.mode === 'open') return t('pack.suite.openPreview')
  if (progress.complete) return t('pack.suite.complete')
  if (progress.unlocked > 0) {
    return t('pack.suite.progress', {unlocked: progress.unlocked, total: progress.total})
  }
  return t('pack.suite.includes', {count: progress.total})
}

function focusSuite(suiteId: string) {
  const target = resolveSuitePaywallTarget(suiteId, suiteUsable.value)
  if (!target) return
  if (target.kind === 'complete') {
    layout.showSuccessToast(t('pack.suite.openCompleteToast', {name: t(suiteNameKey(target.suiteId))}))
    return
  }
  entitlement.openPaywall(target.packId, target.context)
}
</script>

<template>
  <div class="pack-store">
    <section class="mp-status" :aria-label="t('pack.stats.active')">
      <div class="mp-status__item">
        <span class="mp-status__label">{{ t('pack.stats.active') }}</span>
        <strong class="mp-status__value">{{ entitlement.activeCount }}</strong>
      </div>
      <div class="mp-status__item">
        <span class="mp-status__label">{{ t('pack.stats.locked') }}</span>
        <strong class="mp-status__value">{{ entitlement.lockedCount }}</strong>
      </div>
      <div class="mp-status__item">
        <span class="mp-status__label">
          {{ entitlement.mode === 'open' ? t('pack.stats.modeOpen') : t('pack.stats.modeEnforced') }}
        </span>
        <strong class="mp-status__value">{{ entitlement.catalogItems.length }}</strong>
      </div>
      <div v-if="showFreeAiStat" class="mp-status__item">
        <span class="mp-status__label">{{ t('pack.stats.freeAi') }}</span>
        <strong class="mp-status__value mp-status__value--sm">
          {{ entitlement.freeAiCallsRemaining }}/{{ entitlement.freeAiCallsDailyLimit ?? 3 }}
        </strong>
      </div>
    </section>

    <div
        v-if="entitlement.siteProTrialAvailable"
        class="pack-store__site-trial"
    >
      <DwInlineAlert
          :message="t('pack.store.siteProTrialHint', {days: entitlement.siteProTrialDays ?? 7})"
      />
      <DwButton
          variant="primary"
          size="sm"
          type="button"
          :loading="claimingSitePro"
          @click="onClaimSitePro"
      >
        {{ t('pack.store.ctaSiteProTrial', {days: entitlement.siteProTrialDays ?? 7}) }}
      </DwButton>
    </div>

    <section class="pack-suite" aria-labelledby="pack-suite-title">
      <div class="pack-suite__head">
        <div class="pack-suite__copy">
          <h2 id="pack-suite-title" class="pack-suite__title">{{ t('pack.suite.title') }}</h2>
          <p class="pack-suite__sub">{{ t('pack.suite.subtitle') }}</p>
        </div>
        <label class="pack-suite__persona">
          <span class="pack-suite__persona-label">{{ t('pack.persona.label') }}</span>
          <DwSelect
              v-model="persona"
              class="pack-suite__persona-select"
              :options="personaOptions"
              size="sm"
              :aria-label="t('pack.persona.label')"
          />
        </label>
      </div>
      <p class="pack-suite__persona-hint">{{ t(`pack.persona.hint.${persona}`) }}</p>
      <ul class="pack-suite__tips" :aria-label="t('pack.sales.headline')">
        <li>{{ t('pack.sales.tipPro') }}</li>
        <li>{{ t('pack.sales.tipDomestic') }}</li>
        <li>{{ t('pack.sales.tipLegacy') }}</li>
      </ul>
      <p class="pack-suite__pricing">{{ t('pack.sales.pricing') }}</p>
      <div class="pack-suite__grid">
        <button
            v-for="suite in suitesForPersona"
            :key="suite.id"
            class="pack-suite__card"
            :class="{
              'pack-suite__card--recommended': isSuiteRecommendedForPersona(suite.id, persona),
              'pack-suite__card--complete': suiteCardProgress(suite.id)?.complete,
            }"
            type="button"
            :aria-label="`${t(suiteNameKey(suite.id))} · ${suiteMetaLabel(suite.id)}`"
            @click="focusSuite(suite.id)"
        >
          <span
              class="pack-suite__badge"
              :class="{
                'pack-suite__badge--empty':
                  !isSuiteRecommendedForPersona(suite.id, persona) && !suiteCardProgress(suite.id)?.complete,
                'pack-suite__badge--complete': suiteCardProgress(suite.id)?.complete,
              }"
              :aria-hidden="
                !isSuiteRecommendedForPersona(suite.id, persona) && !suiteCardProgress(suite.id)?.complete
              "
          >
            <template v-if="suiteCardProgress(suite.id)?.complete">
              <DwIcon name="check" size="xs" :stroke-width="2"/>
              {{ t('pack.suite.complete') }}
            </template>
            <template v-else-if="isSuiteRecommendedForPersona(suite.id, persona)">
              <DwIcon name="star" size="xs" :stroke-width="2"/>
              {{ t('pack.persona.recommended') }}
            </template>
          </span>
          <span class="pack-suite__name">{{ t(suiteNameKey(suite.id)) }}</span>
          <span class="pack-suite__tagline">{{ t(suiteTaglineKey(suite.id)) }}</span>
          <span class="pack-suite__meta">
            {{ suiteMetaLabel(suite.id) }}
          </span>
        </button>
      </div>
    </section>

    <section class="pack-store__catalog" aria-labelledby="pack-catalog-title">
      <div class="pack-store__catalog-head">
        <h2 id="pack-catalog-title" class="pack-store__catalog-title">{{ t('pack.catalogTitle') }}</h2>
      </div>

      <div class="pack-store__toolbar">
        <div class="dw-segment dw-segment--wrap pack-store__filters" role="tablist" :aria-label="t('pack.filter.all')">
          <button
              v-for="item in filters"
              :key="item.id"
              class="dw-segment__btn"
              :class="{'is-active': filter === item.id}"
              type="button"
              role="tab"
              :aria-selected="filter === item.id"
              @click="filter = item.id"
          >
            {{ t(item.labelKey) }}
          </button>
        </div>
        <SearchInput
            v-model="searchQuery"
            size="sm"
            class="pack-store__search"
            :placeholder="t('pack.searchPlaceholder')"
        />
      </div>

      <EmptyState v-if="filtered.length === 0" :title="t('pack.empty')"/>

      <template v-else>
        <section v-if="capabilityItems.length" class="pack-store__section">
          <h3 class="pack-store__section-title">{{ t('pack.sectionCapability') }}</h3>
          <div class="pack-store__grid">
            <PackCard
                v-for="pack in capabilityItems"
                :key="pack.id"
                :pack="pack"
                @open="onOpen"
                @upgrade="onUpgrade"
            />
          </div>
        </section>

        <section v-if="connectorItems.length" class="pack-store__section">
          <h3 class="pack-store__section-title">{{ t('pack.sectionConnector') }}</h3>
          <div class="pack-store__grid">
            <PackCard
                v-for="pack in connectorItems"
                :key="pack.id"
                :pack="pack"
                @open="onOpen"
                @upgrade="onUpgrade"
            />
          </div>
        </section>
      </template>
    </section>

    <PackAuditPanel v-if="auth.isAdmin"/>
  </div>
</template>
