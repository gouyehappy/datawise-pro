<!-- 桌面：Shell 骨架 → 主界面；Web：AppSplash → Shell -->
<script setup lang="ts">
import AppShell from './AppShell.vue'
import AppSplash from './components/AppSplash.vue'
import DesktopTitleBar from '@/features/layout/components/DesktopTitleBar.vue'
import LockScreenOverlay from '@/features/auth/components/LockScreenOverlay.vue'
import {useAppBoot} from '@/app/composables/useAppBoot'

const {desktopApp, webBootReady, shellBooting} = useAppBoot()
</script>

<template>
  <div v-if="!desktopApp" class="app">
    <div class="app-body">
      <Transition name="app-boot" mode="out-in">
        <AppSplash v-if="!webBootReady" key="splash"/>
        <AppShell v-else key="shell"/>
      </Transition>
    </div>
    <LockScreenOverlay/>
  </div>

  <div v-else class="app app--desktop">
    <DesktopTitleBar/>
    <div class="app-body">
      <AppShell :booting="shellBooting"/>
    </div>
    <LockScreenOverlay/>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.app--desktop {
  background: var(--dw-bg-chrome);
}

.app--desktop .app-body {
  background: var(--dw-bg-chrome);
}

.app-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-body > :deep(.shell),
.app-body > :deep(.app-splash) {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.app-boot-enter-active,
.app-boot-leave-active {
  transition: opacity 0.32s ease;
}

.app-boot-enter-from,
.app-boot-leave-to {
  opacity: 0;
}
</style>
