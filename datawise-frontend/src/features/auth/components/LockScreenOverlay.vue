<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useLockScreenStore} from '@/features/auth/stores/lock-screen-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const {t, locale} = useI18n()
const auth = useAuthStore()
const lockScreen = useLockScreenStore()
const layout = useLayoutStore()

const password = ref('')
const error = ref('')
const unlocking = ref(false)
const shake = ref(false)
const now = ref(new Date())
const passwordInputId = 'lock-screen-password'

let clockTimer: ReturnType<typeof setTimeout> | null = null

const displayName = computed(() => layout.profileName || auth.user?.displayName || auth.user?.userName || '')
const userInitial = computed(() => displayName.value.trim().charAt(0).toUpperCase() || 'U')
const tenantLine = computed(() => {
  if (auth.isGuest || !auth.tenantName) return ''
  return auth.tenantName
})

const clockTime = computed(() => {
  const d = now.value
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})

const clockDate = computed(() => {
  try {
    return new Intl.DateTimeFormat(locale.value || undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(now.value)
  } catch {
    return now.value.toDateString()
  }
})

function msUntilNextMinute() {
  const d = new Date()
  return (60 - d.getSeconds()) * 1000 - d.getMilliseconds()
}

function startClock() {
  stopClock()
  now.value = new Date()
  clockTimer = setTimeout(function tick() {
    now.value = new Date()
    clockTimer = setTimeout(tick, msUntilNextMinute())
  }, msUntilNextMinute())
}

function stopClock() {
  if (clockTimer) {
    clearTimeout(clockTimer)
    clockTimer = null
  }
}

async function focusPassword() {
  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  const input = document.getElementById(passwordInputId)
  if (input instanceof HTMLElement) {
    input.focus()
  }
}

watch(
    () => auth.canLockScreen,
    (canLock) => {
      if (!canLock && lockScreen.locked) {
        lockScreen.unlockLocal()
      }
    },
)

watch(
    () => lockScreen.locked,
    (isLocked) => {
      if (!isLocked) {
        password.value = ''
        error.value = ''
        unlocking.value = false
        shake.value = false
        stopClock()
        return
      }
      password.value = ''
      error.value = ''
      shake.value = false
      startClock()
      void focusPassword()
    },
    {immediate: true},
)

async function submit() {
  if (unlocking.value) return
  const value = password.value
  if (!value) {
    error.value = t('lockScreen.passwordRequiredField')
    triggerShake()
    return
  }
  unlocking.value = true
  error.value = ''
  try {
    await lockScreen.unlockWithPassword(value)
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'lockScreen.unlockFailed')
    password.value = ''
    triggerShake()
    await focusPassword()
  } finally {
    unlocking.value = false
  }
}

function triggerShake() {
  shake.value = false
  requestAnimationFrame(() => {
    shake.value = true
  })
}

function onShakeEnd() {
  shake.value = false
}

function onKeydownCapture(event: KeyboardEvent) {
  if (!lockScreen.locked) return

  if (event.key === 'Escape' && !unlocking.value) {
    password.value = ''
    error.value = ''
    return
  }

  if (event.key === 'Tab') return
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (event.target instanceof Node) {
    const root = document.getElementById('lock-screen-overlay')
    if (root?.contains(event.target)) return
  }
  event.preventDefault()
  event.stopImmediatePropagation()
  if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Enter') {
    void focusPassword()
  }
}

function onPointerDownCapture(event: Event) {
  if (!lockScreen.locked) return
  if (event.target instanceof Node) {
    const root = document.getElementById('lock-screen-overlay')
    if (root?.contains(event.target)) return
  }
  event.preventDefault()
  event.stopImmediatePropagation()
}

watch(
    () => lockScreen.locked,
    (isLocked) => {
      if (isLocked) {
        window.addEventListener('keydown', onKeydownCapture, true)
        window.addEventListener('pointerdown', onPointerDownCapture, true)
      } else {
        window.removeEventListener('keydown', onKeydownCapture, true)
        window.removeEventListener('pointerdown', onPointerDownCapture, true)
      }
    },
    {immediate: true},
)

onMounted(() => {
  if (lockScreen.locked) {
    startClock()
    void focusPassword()
  }
})

onUnmounted(() => {
  stopClock()
  window.removeEventListener('keydown', onKeydownCapture, true)
  window.removeEventListener('pointerdown', onPointerDownCapture, true)
})
</script>

<template>
  <Teleport to="body">
    <div
        v-if="lockScreen.locked"
        id="lock-screen-overlay"
        class="lock-screen"
        role="dialog"
        aria-modal="true"
        :aria-label="t('lockScreen.title')"
        @contextmenu.prevent
        @click="focusPassword"
    >
      <div class="lock-screen__wallpaper" aria-hidden="true">
        <div class="lock-screen__wash lock-screen__wash--top"/>
        <div class="lock-screen__wash lock-screen__wash--orb"/>
        <div class="lock-screen__wash lock-screen__wash--bottom"/>
      </div>

      <div class="lock-screen__clock">
        <div class="lock-screen__time">{{ clockTime }}</div>
        <div class="lock-screen__date">{{ clockDate }}</div>
      </div>

      <section
          class="lock-screen__user-block"
          :class="{'is-shake': shake}"
          @animationend="onShakeEnd"
          @click.stop
      >
        <div class="lock-screen__avatar" aria-hidden="true">
          <span class="lock-screen__avatar-face">{{ userInitial }}</span>
        </div>
        <div class="lock-screen__name">{{ displayName }}</div>
        <div v-if="tenantLine" class="lock-screen__tenant">{{ tenantLine }}</div>

        <form class="lock-screen__prompt" @submit.prevent="submit">
          <div class="lock-screen__field">
            <input
                :id="passwordInputId"
                v-model="password"
                class="lock-screen__input"
                type="password"
                autocomplete="current-password"
                spellcheck="false"
                :placeholder="t('lockScreen.passwordPlaceholder')"
                :disabled="unlocking"
                :aria-label="t('lockScreen.passwordLabel')"
                :aria-invalid="Boolean(error)"
            >
            <button
                type="submit"
                class="lock-screen__go"
                :disabled="unlocking || !password"
                :aria-label="t('lockScreen.unlock')"
            >
              <span v-if="unlocking" class="lock-screen__spinner" aria-hidden="true"/>
              <DwIcon v-else name="chevron-right" size="md" :stroke-width="2.6"/>
            </button>
          </div>
          <p v-if="error" class="lock-screen__error" role="alert">{{ error }}</p>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* color-exception: always-dark lock plate, not a theme surface */
.lock-screen {
  --lock-ease: cubic-bezier(0.22, 1, 0.36, 1);
  position: fixed;
  inset: 0;
  z-index: var(--dw-z-max);
  display: grid;
  grid-template-rows: minmax(18vh, 1fr) auto minmax(12vh, 0.55fr);
  justify-items: center;
  align-items: start;
  padding: clamp(28px, 6vh, 64px) 24px clamp(24px, 5vh, 48px);
  overflow: hidden;
  color: #f5f7fb;
  user-select: none;
  background: #0b1020;
}

.lock-screen__wallpaper {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.lock-screen__wash {
  position: absolute;
  inset: 0;
}

.lock-screen__wash--top {
  background:
      radial-gradient(ellipse 90% 55% at 50% -10%, color-mix(in srgb, var(--dw-primary) 34%, transparent), transparent 58%),
      linear-gradient(180deg, #152038 0%, transparent 42%);
}

.lock-screen__wash--orb {
  background:
      radial-gradient(circle at 18% 72%, color-mix(in srgb, var(--dw-primary) 18%, transparent), transparent 42%),
      radial-gradient(circle at 82% 38%, color-mix(in srgb, #5b8cff 16%, transparent), transparent 36%);
  opacity: 0.9;
}

.lock-screen__wash--bottom {
  background:
      linear-gradient(180deg, transparent 45%, color-mix(in srgb, #05070f 78%, transparent) 100%),
      radial-gradient(ellipse 70% 40% at 50% 110%, color-mix(in srgb, var(--dw-text) 55%, transparent), transparent 70%);
}

.lock-screen__clock {
  position: relative;
  z-index: 1;
  margin-top: clamp(8px, 2vh, 24px);
  text-align: center;
  text-shadow: 0 8px 28px color-mix(in srgb, var(--dw-text) 45%, transparent);
}

.lock-screen__time {
  font-size: clamp(72px, 13vw, 108px);
  font-weight: 200;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.045em;
  line-height: 0.95;
}

.lock-screen__date {
  margin-top: 10px;
  font-size: clamp(17px, 2.2vw, 22px);
  font-weight: 450;
  letter-spacing: 0.01em;
  color: color-mix(in srgb, var(--dw-on-accent) 78%, transparent);
  text-transform: capitalize;
}

.lock-screen__user-block {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  align-self: center;
  width: min(280px, 100%);
  gap: 0;
}

.lock-screen__user-block.is-shake {
  animation: lock-shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

.lock-screen__avatar {
  display: grid;
  place-items: center;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  padding: 3px;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.42));
  box-shadow:
      0 14px 36px rgba(0, 0, 0, 0.42),
      0 0 0 1px rgba(255, 255, 255, 0.18);
}

.lock-screen__avatar-face {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  font-size: 36px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--dw-on-accent);
  background: linear-gradient(
      155deg,
      color-mix(in srgb, var(--dw-primary) 92%, #fff),
      color-mix(in srgb, var(--dw-primary) 68%, #1b2340)
  );
}

.lock-screen__name {
  margin-top: 14px;
  font-size: 20px;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: #fff;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
}

.lock-screen__tenant {
  margin-top: 4px;
  font-size: 12px;
  color: color-mix(in srgb, var(--dw-on-accent) 48%, transparent);
}

.lock-screen__prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin-top: 18px;
  gap: 10px;
}

.lock-screen__field {
  position: relative;
  display: flex;
  align-items: center;
  width: min(220px, 100%);
}

.lock-screen__input {
  width: 100%;
  height: var(--dw-density-md);
  padding: 0 38px 0 14px;
  border: 0;
  border-radius: var(--dw-radius-pill);
  outline: none;
  color: #1a1d27;
  background: rgba(255, 255, 255, 0.78);
  box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.35) inset,
      0 10px 28px rgba(0, 0, 0, 0.28);
  font-size: 13px;
  letter-spacing: 0.02em;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.lock-screen__input::placeholder {
  color: rgba(26, 29, 39, 0.42);
}

.lock-screen__input:focus {
  background: rgba(255, 255, 255, 0.92);
  box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.55) inset,
      0 0 0 3px color-mix(in srgb, var(--dw-primary) 28%, transparent),
      0 10px 28px rgba(0, 0, 0, 0.28);
}

.lock-screen__input:disabled {
  opacity: 0.72;
}

.lock-screen__go {
  position: absolute;
  right: 2px;
  top: 50%;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 28px;
  height: var(--dw-density-sm);
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: #fff;
  background: color-mix(in srgb, var(--dw-primary) 86%, #111);
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.15s var(--lock-ease), background 0.15s ease;
}

.lock-screen__go:hover:not(:disabled) {
  transform: translateY(-50%) scale(1.06);
  background: color-mix(in srgb, var(--dw-primary) 96%, #111);
}

.lock-screen__go:disabled {
  opacity: 0.32;
  cursor: default;
}

.lock-screen__spinner {
  width: 11px;
  height: 11px;
  border: 1.5px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: lock-spin 0.7s linear infinite;
}

.lock-screen__error {
  margin: 0;
  max-width: 240px;
  text-align: center;
  font-size: 12px;
  line-height: 1.4;
  color: #ff8f8f;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.35);
}

@keyframes lock-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes lock-shake {
  10%, 90% {
    transform: translateX(-1px);
  }
  20%, 80% {
    transform: translateX(3px);
  }
  30%, 50%, 70% {
    transform: translateX(-5px);
  }
  40%, 60% {
    transform: translateX(5px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lock-screen__user-block.is-shake,
  .lock-screen__spinner {
    animation: none;
  }
}
</style>
