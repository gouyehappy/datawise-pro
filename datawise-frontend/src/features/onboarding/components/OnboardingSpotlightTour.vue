<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, IconButton} from '@/core/components'
import {DwIcon} from '@/core/icons'
import type {DwIconName} from '@/core/icons'
import {
    ONBOARDING_TOUR_STEPS,
    resolveOnboardingTourSteps,
    type OnboardingTourPreset,
    type OnboardingTourStep,
} from '@/features/onboarding/services/onboarding-tour.config'
import {
    layoutSpotlightTour,
    spotlightBoxStyle,
    TOOLTIP_ESTIMATED_HEIGHT,
    tooltipBoxStyle,
} from '@/features/onboarding/services/onboarding-spotlight.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'

const STEP_HEIGHT_HINT: Record<string, number> = {
    welcome: 400,
    tips: 340,
}

const STEP_ICON: Record<string, DwIconName> = {
  home: 'user',
  database: 'database',
  explorer: 'open',
  workspace: 'layout',
  ai: 'ai',
  terminal: 'terminal',
  team: 'users',
  tips: 'about',
  welcome: 'tab-welcome',
}

function stepIcon(stepId: string): DwIconName {
  return STEP_ICON[stepId] ?? 'star'
}

const props = defineProps<{ open: boolean; preset?: OnboardingTourPreset }>()
const emit = defineEmits<{
    'update:open': [value: boolean]
    finish: []
    skip: []
}>()

const {t} = useI18n()
const layout = useLayoutStore()
const appConfig = useAppConfigStore()
const workspace = useWorkspaceStore()

const stepIndex = ref(0)
const layoutTick = ref(0)
const cardRef = ref<HTMLElement | null>(null)
const measuredCardHeight = ref(0)
const steps = computed(() => resolveOnboardingTourSteps(props.preset ?? 'default'))

const currentStep = computed(() => steps.value[stepIndex.value] ?? ONBOARDING_TOUR_STEPS[0])
const stepId = computed(() => currentStep.value.id)
const isFirstStep = computed(() => stepIndex.value === 0)
const isLastStep = computed(() => stepIndex.value === steps.value.length - 1)
const isCenterStep = computed(() => !currentStep.value.target || currentStep.value.placement === 'center')

const layoutCardHeight = computed(() => {
    if (measuredCardHeight.value > 0) return measuredCardHeight.value
    return STEP_HEIGHT_HINT[stepId.value] ?? TOOLTIP_ESTIMATED_HEIGHT
})

const spotlightLayout = computed(() => {
    layoutTick.value
    const step = currentStep.value
    return layoutSpotlightTour(step.target, step.placement, undefined, layoutCardHeight.value)
})

const highlightStyle = computed(() => spotlightBoxStyle(spotlightLayout.value.highlight))
const cardStyle = computed(() =>
    tooltipBoxStyle(spotlightLayout.value.tooltip, spotlightLayout.value.arrowOffset),
)
const arrowSide = computed(() => spotlightLayout.value.arrowSide)
const resolvedPlacement = computed(() => spotlightLayout.value.resolvedPlacement)

const hintArrow = computed(() => {
    if (isCenterStep.value) return ''
    switch (resolvedPlacement.value) {
        case 'right': return '←'
        case 'left': return '→'
        case 'top': return '↓'
        case 'bottom': return '↑'
        default: return '→'
    }
})

const stepTitle = computed(() => t(`onboarding.steps.${stepId.value}.title`))
const stepBody = computed(() => {
    const key = `onboarding.steps.${stepId.value}.body`
    const text = t(key)
    return text === key ? '' : text
})
const stepHint = computed(() => {
    const key = `onboarding.steps.${stepId.value}.hint`
    const text = t(key)
    return text === key ? '' : text
})

function syncCardHeight() {
    if (!cardRef.value) return
    const nextHeight = Math.ceil(cardRef.value.getBoundingClientRect().height)
    if (nextHeight > 0 && nextHeight !== measuredCardHeight.value) {
        measuredCardHeight.value = nextHeight
        layoutTick.value += 1
    }
}

async function remeasure() {
    await nextTick()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    syncCardHeight()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    syncCardHeight()
}

async function applyStepPrepare(step: OnboardingTourStep) {
    if (step.prepare) {
        await step.prepare({layout, appConfig, workspace})
    }
    await nextTick()
    await remeasure()
    const target = step.target ? document.querySelector(`[data-onboarding="${step.target}"]`) : null
    target?.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'smooth'})
    await new Promise<void>((resolve) => window.setTimeout(resolve, 280))
    await remeasure()
}

watch(
    () => props.open,
    async (isOpen) => {
        if (!isOpen) return
        stepIndex.value = 0
        measuredCardHeight.value = 0
        await applyStepPrepare(steps.value[0])
    },
)

watch(stepIndex, async (index) => {
    if (!props.open) return
    measuredCardHeight.value = 0
    await applyStepPrepare(steps.value[index] ?? steps.value[0])
})

let resizeObserver: ResizeObserver | null = null

watch(cardRef, (el, prev) => {
    if (!resizeObserver) return
    if (prev) resizeObserver.unobserve(prev)
    if (el) resizeObserver.observe(el)
})

onMounted(() => {
    window.addEventListener('resize', remeasure)
    window.addEventListener('scroll', remeasure, true)
    window.addEventListener('keydown', onKeydown)
    resizeObserver = new ResizeObserver(() => {
        syncCardHeight()
    })
    if (cardRef.value) resizeObserver.observe(cardRef.value)
})

onUnmounted(() => {
    window.removeEventListener('resize', remeasure)
    window.removeEventListener('scroll', remeasure, true)
    window.removeEventListener('keydown', onKeydown)
    resizeObserver?.disconnect()
    document.body.style.overflow = ''
})

function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && props.open) {
        event.preventDefault()
        onSkip()
    }
}

watch(
    () => props.open,
    (isOpen) => {
        document.body.style.overflow = isOpen ? 'hidden' : ''
    },
    {immediate: true},
)

function close() {
    emit('update:open', false)
}

function onSkip() {
    emit('skip')
    close()
}

function onBack() {
    if (stepIndex.value > 0) stepIndex.value -= 1
}

async function onNext() {
    if (isLastStep.value) {
        await onFinish()
        return
    }
    stepIndex.value += 1
}

async function onFinish() {
    if (!appConfig.showExplorerPanel) {
        appConfig.setShowExplorerPanel(true)
    }
    layout.setModule('database')
    workspace.openConsole()
    emit('finish')
    close()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-overlay">
      <div v-if="open" class="onboarding-tour" role="dialog" aria-modal="true" :aria-label="t('onboarding.title')">
        <div v-if="isCenterStep" class="onboarding-tour__backdrop onboarding-tour__backdrop--full"/>
        <div
            v-else-if="highlightStyle"
            class="onboarding-tour__spotlight"
            :style="highlightStyle"
        >
          <span class="onboarding-tour__corner onboarding-tour__corner--tl" aria-hidden="true"/>
          <span class="onboarding-tour__corner onboarding-tour__corner--tr" aria-hidden="true"/>
          <span class="onboarding-tour__corner onboarding-tour__corner--bl" aria-hidden="true"/>
          <span class="onboarding-tour__corner onboarding-tour__corner--br" aria-hidden="true"/>
        </div>

        <article
            ref="cardRef"
            class="onboarding-tour__card"
            :class="[
              `onboarding-tour__card--arrow-${arrowSide}`,
              `onboarding-tour__card--step-${stepId}`,
              { 'onboarding-tour__card--center': isCenterStep },
            ]"
            :style="cardStyle"
        >
          <div class="onboarding-tour__card-body">
            <header class="onboarding-tour__head">
              <div class="onboarding-tour__head-left">
                <span class="onboarding-tour__icon" :class="`onboarding-tour__icon--${stepId}`" aria-hidden="true">
                  <DwIcon :name="stepIcon(stepId)" :stroke-width="1.8"/>
                </span>
                <span class="onboarding-tour__badge">
                  {{ stepIndex + 1 }} / {{ steps.length }}
                </span>
              </div>
              <IconButton size="sm" :title="t('onboarding.skip')" @click="onSkip">×</IconButton>
            </header>

            <div v-if="stepId === 'welcome'" class="onboarding-tour__hero" aria-hidden="true">
              <DwIcon name="tab-welcome" :size="48" :stroke-width="1.5"/>
            </div>

            <div v-if="stepId === 'tips'" class="onboarding-tour__kbd-row" aria-hidden="true">
              <kbd>Ctrl</kbd>
              <span>+</span>
              <kbd>K</kbd>
            </div>

            <h2 class="onboarding-tour__title">{{ stepTitle }}</h2>
            <p v-if="stepId === 'welcome'" class="onboarding-tour__subtitle">{{ t('onboarding.subtitle') }}</p>
            <p v-if="stepBody" class="onboarding-tour__body">{{ stepBody }}</p>
            <p v-if="stepHint" class="onboarding-tour__hint">
              <span class="onboarding-tour__hint-arrow" aria-hidden="true">{{ hintArrow }}</span>
              {{ stepHint }}
            </p>

            <div class="onboarding-tour__progress" role="progressbar" :aria-valuenow="stepIndex + 1" :aria-valuemax="steps.length">
              <span
                  v-for="(_, index) in steps"
                  :key="index"
                  class="onboarding-tour__dot"
                  :class="{ 'is-active': index === stepIndex, 'is-done': index < stepIndex }"
              />
            </div>
          </div>

          <footer class="onboarding-tour__actions app-modal-footer">
            <DwButton variant="ghost" type="button" @click="onSkip">
              {{ t('onboarding.skip') }}
            </DwButton>
            <div class="onboarding-tour__nav">
              <DwButton v-if="!isFirstStep" variant="ghost" type="button" @click="onBack">
                {{ t('onboarding.back') }}
              </DwButton>
              <DwButton variant="primary" type="button" @click="onNext">
                {{ isLastStep ? t('onboarding.finish') : t('onboarding.next') }}
              </DwButton>
            </div>
          </footer>
        </article>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.onboarding-tour {
  position: fixed;
  inset: 0;
  z-index: var(--dw-z-spotlight);
  pointer-events: none;
}

.onboarding-tour__backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--dw-overlay-bg-strong);
  backdrop-filter: blur(var(--dw-overlay-blur));
  pointer-events: none;
}

.onboarding-tour__backdrop--full {
  background: var(--dw-overlay-bg-strong);
  backdrop-filter: blur(var(--dw-overlay-blur));
}

.onboarding-tour__spotlight {
  position: fixed;
  border-radius: var(--dw-panel-radius);
  box-shadow:
      0 0 0 9999px var(--dw-overlay-bg-strong),
      0 0 0 1px color-mix(in srgb, var(--dw-primary) 45%, white);
  transition:
      top 0.5s cubic-bezier(0.22, 1, 0.36, 1),
      left 0.5s cubic-bezier(0.22, 1, 0.36, 1),
      width 0.5s cubic-bezier(0.22, 1, 0.36, 1),
      height 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
}

.onboarding-tour__corner {
  position: absolute;
  width: var(--dw-icon-size-sm);
  height: var(--dw-icon-size-sm);
  border-color: var(--dw-primary);
  border-style: solid;
  opacity: 0.85;
}

.onboarding-tour__corner--tl { top: 6px; left: 6px; border-width: 2px 0 0 2px; border-radius: var(--dw-control-radius-sm) 0 0 0; }
.onboarding-tour__corner--tr { top: 6px; right: 6px; border-width: 2px 2px 0 0; border-radius: 0 var(--dw-control-radius-sm) 0 0; }
.onboarding-tour__corner--bl { bottom: 6px; left: 6px; border-width: 0 0 2px 2px; border-radius: 0 0 0 var(--dw-control-radius-sm); }
.onboarding-tour__corner--br { bottom: 6px; right: 6px; border-width: 0 2px 2px 0; border-radius: 0 0 var(--dw-control-radius-sm) 0; }

.onboarding-tour__card {
  position: fixed;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 0;
  border-radius: var(--dw-panel-radius);
  border: 1px solid color-mix(in srgb, var(--dw-primary) 28%, var(--dw-border-light));
  background: var(--dw-bg-panel);
  backdrop-filter: none;
  box-shadow: var(--dw-shadow);
  transition:
      top 0.5s cubic-bezier(0.22, 1, 0.36, 1),
      left 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: auto;
  overflow: hidden;
  isolation: isolate;
}

.onboarding-tour__card-body {
  position: relative;
  z-index: 1;
  padding: var(--dw-space-8) var(--dw-space-8) 0;
}

.onboarding-tour__card--center {
  text-align: center;
}

.onboarding-tour__card--center .onboarding-tour__hint {
  margin-inline: auto;
}

.onboarding-tour__card--arrow-left::before,
.onboarding-tour__card--arrow-right::before,
.onboarding-tour__card--arrow-top::before,
.onboarding-tour__card--arrow-bottom::before {
  content: '';
  position: absolute;
  width: var(--dw-icon-size-sm);
  height: var(--dw-icon-size-sm);
  background: var(--dw-bg);
  border: 1px solid color-mix(in srgb, var(--dw-primary) 28%, var(--dw-border-light));
  transform: rotate(45deg);
  z-index: 0;
}

.onboarding-tour__card--arrow-left::before {
  left: -8px;
  top: var(--tour-arrow-offset, 72px);
  border-right: none;
  border-top: none;
}

.onboarding-tour__card--arrow-right::before {
  right: -8px;
  top: var(--tour-arrow-offset, 72px);
  border-left: none;
  border-bottom: none;
}

.onboarding-tour__card--arrow-top::before {
  top: -8px;
  left: var(--tour-arrow-offset, 50%);
  margin-left: -7px;
  border-right: none;
  border-bottom: none;
}

.onboarding-tour__card--arrow-bottom::before {
  bottom: -8px;
  left: var(--tour-arrow-offset, 50%);
  margin-left: -7px;
  border-left: none;
  border-top: none;
}

.onboarding-tour__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-6);
  margin-bottom: var(--dw-space-4);
}

.onboarding-tour__head-left {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
}

.onboarding-tour__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: var(--dw-tab-height);
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-primary) 12%, var(--dw-bg-muted));
  color: var(--dw-primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--dw-primary) 18%, transparent) inset;
}

.onboarding-tour__icon svg {
  width: var(--dw-icon-size-lg);
  height: var(--dw-icon-size-lg);
}

.onboarding-tour__badge {
  display: inline-flex;
  align-items: center;
  padding: var(--dw-space-1) var(--dw-space-5);
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-primary) 10%, var(--dw-bg-muted));
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.onboarding-tour__hero {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 72px;
  margin: var(--dw-space-1) 0 var(--dw-space-4);
  color: var(--dw-primary);
}

.onboarding-tour__kbd-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--dw-gap);
  margin: var(--dw-space-2) 0 var(--dw-space-6);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-md);
}

.onboarding-tour__kbd-row kbd {
  min-width: 38px;
  padding: var(--dw-space-3) var(--dw-space-5);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-panel);
  box-shadow: none;
  font-family: var(--dw-mono);
  font-size: var(--dw-text-sm);
  font-weight: 700;
  color: var(--dw-text);
}

.onboarding-tour__title {
  margin: 0 0 var(--dw-space-3);
  font-size: var(--dw-text-3xl);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.onboarding-tour__subtitle {
  margin: 0 0 var(--dw-space-4);
  color: var(--dw-primary);
  font-size: var(--dw-text-md);
  font-weight: 600;
}

.onboarding-tour__body {
  margin: 0;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xl);
  line-height: var(--dw-leading-loose);
}

.onboarding-tour__hint {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap);
  margin: var(--dw-space-5) 0 0;
  padding: var(--dw-space-3) var(--dw-space-5);
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-primary) 10%, var(--dw-bg-muted));
  border: 1px solid color-mix(in srgb, var(--dw-primary) 16%, transparent);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading);
}

.onboarding-tour__hint-arrow {
  display: inline-flex;
  color: var(--dw-primary);
  font-size: var(--dw-text-md);
  font-weight: 700;
  animation: tour-hint-nudge 1.2s ease-in-out infinite;
}

@keyframes tour-hint-nudge {
  0%, 100% { transform: translate(0, 0); opacity: 0.7; }
  50% { transform: translate(-3px, -2px); opacity: 1; }
}

.onboarding-tour__progress {
  display: flex;
  gap: var(--dw-space-2);
  margin: var(--dw-space-7) 0 0;
}

.onboarding-tour__dot {
  flex: 1;
  height: 4px;
  border-radius: var(--dw-radius-pill);
  background: var(--dw-border-light);
  transition: background 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease;
}

.onboarding-tour__dot.is-active {
  background: var(--dw-primary);
  transform: none;
  box-shadow: none;
}

.onboarding-tour__dot.is-done {
  background: color-mix(in srgb, var(--dw-primary) 50%, var(--dw-border-light));
}

.onboarding-tour__actions {
  position: relative;
  z-index: 1;
  justify-content: space-between;
  margin-top: var(--dw-space-7);
  border-radius: 0 0 var(--dw-panel-radius) var(--dw-panel-radius);
}

.onboarding-tour__nav {
  display: flex;
  gap: var(--dw-gap);
}
</style>
