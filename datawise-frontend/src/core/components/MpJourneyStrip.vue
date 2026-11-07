<script setup lang="ts">
/** HOST_ONLY — Pack / paywall journey strip; never ship in `@datawise/*`. */
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton} from '@/core/components'

export interface MpJourneyAction {
    id: string
    label: string
    variant?: 'primary' | 'secondary' | 'ghost'
    onClick: () => void
}

export interface MpJourneyNoteAction {
    id: string
    label: string
    onClick: () => void
}

const PACK_ACTION_IDS = new Set(['packs', 'store', 'suites', 'browse-packs'])

const props = withDefaults(
    defineProps<{
        actions?: MpJourneyAction[]
        /** One-line entitlement / status summary (right side). */
        summary?: string
        /** Optional secondary note (tier / packaging explainer). */
        noteTitle?: string
        noteBody?: string
        noteActions?: MpJourneyNoteAction[]
        /** Override pack teaser pitch; empty uses default i18n. */
        packPitch?: string
        /** When false, never show pack teaser even when lockedCount & enforced. */
        showPackTeaser?: boolean
        /** Entitlement mode from host (`enforced` enables pack teaser). */
        entitlementMode?: string
        /** Locked pack count for teaser copy / visibility. */
        lockedCount?: number
        /** Browse packs action from host (required for teaser CTA). */
        onBrowsePacks?: () => void
    }>(),
    {
        actions: () => [],
        summary: '',
        noteTitle: '',
        noteBody: '',
        noteActions: () => [],
        packPitch: '',
        showPackTeaser: true,
        entitlementMode: '',
        lockedCount: 0,
    },
)

const {t} = useI18n()

const showTeaser = computed(() => {
    if (!props.showPackTeaser) return false
    if (props.entitlementMode !== 'enforced') return false
    return props.lockedCount > 0
})

/** Avoid a second “browse packs” control when the page already has one. */
const showTeaserBrowse = computed(() =>
    Boolean(props.onBrowsePacks) && !props.actions.some((action) => PACK_ACTION_IDS.has(action.id)),
)

const teaserPitch = computed(() => {
    if (props.packPitch.trim()) return props.packPitch.trim()
    return t('nav.journey.packTeaser', {count: props.lockedCount})
})

const showNote = computed(() =>
    Boolean(props.noteTitle.trim() || props.noteBody.trim() || props.noteActions.length),
)

const showAside = computed(() =>
    Boolean(props.summary.trim() || showTeaser.value),
)

const showPrimaryRow = computed(() =>
    props.actions.length > 0 || showAside.value,
)

const hasContent = computed(() => showPrimaryRow.value || showNote.value)

function openPackStore() {
    props.onBrowsePacks?.()
}
</script>

<template>
  <div
      v-if="hasContent"
      class="mp-journey"
      data-testid="mp-journey"
  >
    <div v-if="showPrimaryRow" class="mp-journey__row">
      <div v-if="actions.length" class="mp-journey__actions">
        <DwButton
            v-for="(action, index) in actions"
            :key="action.id"
            size="sm"
            :variant="action.variant ?? (index === 0 ? 'primary' : 'secondary')"
            type="button"
            @click="action.onClick"
        >
          {{ action.label }}
        </DwButton>
      </div>
      <div v-if="showAside" class="mp-journey__aside">
        <p v-if="summary.trim()" class="mp-journey__summary" data-testid="mp-journey-summary">
          {{ summary }}
        </p>
        <div v-if="showTeaser" class="mp-journey__pack" role="note">
          <p class="mp-journey__pack-text">{{ teaserPitch }}</p>
          <DwButton
              v-if="showTeaserBrowse"
              variant="ghost"
              size="sm"
              type="button"
              @click="openPackStore"
          >
            {{ t('nav.journey.browsePacks') }}
          </DwButton>
        </div>
      </div>
    </div>

    <div v-if="showNote" class="mp-journey__note" data-testid="mp-journey-note">
      <div class="mp-journey__note-copy">
        <p v-if="noteTitle.trim()" class="mp-journey__note-title">{{ noteTitle }}</p>
        <p v-if="noteBody.trim()" class="mp-journey__note-body">{{ noteBody }}</p>
      </div>
      <div v-if="noteActions.length" class="mp-journey__note-actions">
        <DwButton
            v-for="action in noteActions"
            :key="action.id"
            size="sm"
            variant="secondary"
            type="button"
            @click="action.onClick"
        >
          {{ action.label }}
        </DwButton>
      </div>
    </div>
  </div>
</template>
