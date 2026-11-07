<script setup lang="ts">
import {useI18n} from 'vue-i18n'

defineProps<{
  capabilities: { title: string; desc: string }[]
}>()

const {t} = useI18n()
</script>

<template>
  <div class="welcome-card">
    <div class="welcome-card__head">
      <h2>{{ t('ai.welcomeTitle') }}</h2>
      <p class="welcome-intro">{{ t('ai.welcomeIntro') }}</p>
    </div>
    <div class="capability-grid">
      <article v-for="(cap, index) in capabilities" :key="cap.title" class="cap-card">
        <span class="cap-index">{{ index + 1 }}</span>
        <div class="cap-copy">
          <strong>{{ cap.title }}</strong>
          <span>{{ cap.desc }}</span>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.welcome-card {
  padding: var(--dw-space-9) 22px;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: linear-gradient(
      165deg,
      color-mix(in srgb, var(--dw-primary) 5%, var(--dw-bg-panel)),
      var(--dw-bg-panel)
  );
}

.welcome-card__head {
  margin-bottom: var(--dw-space-8);
}

.welcome-card h2 {
  margin: 0;
  font-size: var(--dw-text-3xl);
  font-weight: 600;
  line-height: var(--dw-leading-snug);
}

.welcome-intro {
  margin: var(--dw-space-4) 0 0;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-md);
  line-height: var(--dw-leading-loose);
}

.capability-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--dw-gap-md);
}

.cap-card {
  display: flex;
  align-items: flex-start;
  gap: var(--dw-gap-md);
  padding: var(--dw-space-6) var(--dw-space-7);
  border-radius: var(--dw-panel-radius);
  border: 1px solid var(--dw-border-light);
  background: var(--dw-bg);
}

.cap-index {
  flex-shrink: 0;
  width: 24px;
  height: var(--dw-control-h-xs);
  border-radius: var(--dw-control-radius);
  background: var(--dw-primary-soft);
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  font-weight: 700;
  line-height: var(--dw-control-h-xs);
  text-align: center;
}

.cap-copy {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-xs);
  min-width: 0;
}

.cap-copy strong {
  font-size: var(--dw-text-md);
  line-height: var(--dw-leading-snug);
}

.cap-copy span {
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading);
}
</style>
