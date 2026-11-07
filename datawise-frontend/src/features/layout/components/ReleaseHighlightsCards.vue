<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {
    isReleaseHighlightsDismissed,
    markReleaseHighlightsDismissed,
    RELEASE_HIGHLIGHT_CARDS,
    RELEASE_HIGHLIGHTS_VERSION,
    type ReleaseHighlightAction,
    type ReleaseHighlightScope,
} from '@/features/layout/services/release-highlights.service'

const props = defineProps<{
    scope: ReleaseHighlightScope
}>()

const emit = defineEmits<{
    action: [action: ReleaseHighlightAction]
}>()

const {t} = useI18n()
const dismissed = ref(isReleaseHighlightsDismissed(props.scope))

const cards = computed(() => RELEASE_HIGHLIGHT_CARDS)

const visible = computed(() => !dismissed.value && cards.value.length > 0)

function dismiss() {
    dismissed.value = true
    markReleaseHighlightsDismissed(props.scope)
}
</script>

<template>
  <section v-if="visible" class="release-cards" :aria-label="t('platform.release.title')">
    <header class="release-cards__head">
      <div>
        <p class="release-cards__eyebrow">{{ RELEASE_HIGHLIGHTS_VERSION }}</p>
        <h3 class="release-cards__title">{{ t('platform.release.title') }}</h3>
        <p class="release-cards__sub">{{ t('platform.release.subtitle') }}</p>
      </div>
      <button type="button" class="release-cards__dismiss" @click="dismiss">
        {{ t('platform.release.dismiss') }}
      </button>
    </header>

    <div class="release-cards__grid">
      <article
          v-for="card in cards"
          :key="card.id"
          class="release-card"
      >
        <h4>{{ t(`platform.release.cards.${card.id}.title`) }}</h4>
        <p>{{ t(`platform.release.cards.${card.id}.desc`) }}</p>
        <button
            v-if="card.action"
            type="button"
            class="release-card__cta"
            @click="emit('action', card.action)"
        >
          {{ t(`platform.release.cards.${card.id}.cta`) }}
        </button>
      </article>
    </div>
  </section>
</template>

<style scoped>
.release-cards {
  margin: 0 0 var(--dw-space-6);
  padding: var(--dw-space-6);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: linear-gradient(145deg, var(--dw-bg), color-mix(in srgb, var(--dw-primary) 4%, var(--dw-bg)));
}

.release-cards__head {
  display: flex;
  justify-content: space-between;
  gap: var(--dw-space-6);
  align-items: flex-start;
  margin-bottom: var(--dw-space-5);
}

.release-cards__eyebrow {
  margin: 0;
  font-size: var(--dw-text-xs);
  font-weight: 700;
  color: var(--dw-primary);
}

.release-cards__title {
  margin: var(--dw-space-1) 0 0;
  font-size: var(--dw-text-lg);
}

.release-cards__sub {
  margin: var(--dw-space-1) 0 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.release-cards__dismiss {
  border: none;
  background: transparent;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
  cursor: pointer;
}

.release-cards__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--dw-gap);
}

.release-card {
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  padding: var(--dw-space-5);
  background: var(--dw-bg-panel);
}

.release-card h4 {
  margin: 0;
  font-size: var(--dw-text-md);
}

.release-card p {
  margin: var(--dw-space-3) 0 var(--dw-space-4);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.release-card__cta {
  border: 1px solid var(--dw-primary);
  color: var(--dw-primary);
  background: transparent;
  border-radius: var(--dw-control-radius-sm);
  padding: var(--dw-space-2) var(--dw-space-4);
  font-size: var(--dw-text-sm);
  cursor: pointer;
}

@media (max-width: 980px) {
  .release-cards__grid {
    grid-template-columns: 1fr;
  }
}
</style>

