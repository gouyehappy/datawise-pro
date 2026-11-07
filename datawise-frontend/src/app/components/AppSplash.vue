<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import AppBrandLogo from '@/features/layout/components/AppBrandLogo.vue'
import {bootstrapProgress, type BootstrapStepId} from '@/app/services/bootstrap-app.service'
import {APP_VERSION} from '@/features/settings/services/about-settings.service'

const {t} = useI18n()

const progressValue = computed(() => bootstrapProgress.progress)

const statusText = computed(() =>
    t(`app.splashSteps.${bootstrapProgress.currentStep as BootstrapStepId}`),
)
</script>

<template>
  <div
      class="app-splash"
      role="status"
      aria-live="polite"
      :aria-label="statusText"
  >
    <div class="app-splash__stage">
      <div class="app-splash__hero">
        <div class="app-splash__mark">
          <span class="app-splash__ring" aria-hidden="true"/>
          <span class="app-splash__ring app-splash__ring--lag" aria-hidden="true"/>
          <AppBrandLogo size="lg" class="app-splash__logo"/>
        </div>

        <p class="app-splash__kicker">{{ t('app.splashKicker') }}</p>
        <h1 class="app-splash__title">{{ t('app.title') }}</h1>
        <p class="app-splash__tagline">{{ t('app.splashTagline') }}</p>
      </div>

      <div class="app-splash__load">
        <div
            class="app-splash__progress"
            role="progressbar"
            :aria-valuenow="progressValue"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="statusText"
        >
          <span class="app-splash__progress-fill" :style="{width: `${Math.max(8, progressValue)}%`}"/>
        </div>
        <p class="app-splash__footer-line">
          <span>{{ t('app.splashVersion', {version: APP_VERSION}) }}</span>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-splash {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: hidden;
  background: var(--dw-bg-editor);
  color: var(--dw-text);
}

.app-splash__stage {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(40px, 7vh, 72px);
  padding: clamp(32px, 6vh, 64px) clamp(24px, 5vw, 56px);
}

.app-splash__hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 42rem;
  animation: splash-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.app-splash__mark {
  position: relative;
  display: grid;
  place-items: center;
  width: 96px;
  height: 96px;
  margin-bottom: var(--dw-space-9);
}

.app-splash__ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--dw-primary) 28%, transparent);
  box-shadow: none;
  animation: splash-pulse 2.8s ease-out infinite;
}

.app-splash__ring--lag {
  inset: -10px;
  border-color: color-mix(in srgb, var(--dw-primary) 22%, transparent);
  box-shadow: none;
  animation-delay: 0.9s;
  opacity: 0.7;
}

.app-splash__logo {
  position: relative;
  z-index: 1;
  width: 64px !important;
  height: 64px !important;
}

.app-splash__kicker {
  margin: 0 0 var(--dw-space-4);
  font-size: var(--dw-text-xs);
  font-weight: 650;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--dw-primary) 72%, var(--dw-text-secondary));
}

.app-splash__title {
  margin: 0;
  font-size: clamp(40px, 6.2vw, 56px);
  font-weight: 750;
  letter-spacing: -0.045em;
  line-height: 1;
  color: var(--dw-text);
}

.app-splash__tagline {
  margin: var(--dw-space-6) 0 0;
  max-width: 34rem;
  font-size: clamp(15px, 1.7vw, 17px);
  font-weight: 500;
  line-height: var(--dw-leading-relaxed);
  color: var(--dw-text-secondary);
  letter-spacing: 0.01em;
}

.app-splash__load {
  width: min(100%, 420px);
  animation: splash-rise 0.75s cubic-bezier(0.22, 1, 0.36, 1) 0.12s both;
}

.app-splash__progress {
  position: relative;
  height: 3px;
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-text) 8%, var(--dw-border-light));
  overflow: hidden;
}

.app-splash__progress-fill {
  position: relative;
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--dw-primary);
  box-shadow: none;
  transition: width 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

.app-splash__progress-fill::after {
  display: none;
}

.app-splash__footer-line {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--dw-space-3);
  margin: var(--dw-space-7) 0 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.app-splash__dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--dw-text-muted) 70%, transparent);
}

@keyframes splash-rise {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes splash-pulse {
  0% {
    transform: scale(0.92);
    opacity: 0.85;
  }
  70% {
    transform: scale(1.12);
    opacity: 0;
  }
  100% {
    transform: scale(1.12);
    opacity: 0;
  }
}

@media (max-width: 560px) {
  .app-splash__mark {
    width: 84px;
    height: 84px;
  }

  .app-splash__logo {
    width: 56px !important;
    height: 56px !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-splash__hero,
  .app-splash__load,
  .app-splash__ring {
    animation: none;
  }
}
</style>
