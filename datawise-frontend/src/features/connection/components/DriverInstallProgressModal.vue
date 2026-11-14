<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwButton, ProgressBar} from '@/core/components'
import {formatRuntimeBytes} from '@/features/settings/services/runtime-format.service'
import {useDriverInstallStore} from '@/features/connection/stores/driver-install'

const {t} = useI18n()
const install = useDriverInstallStore()

const statusText = computed(() => {
  const downloaded = formatRuntimeBytes(install.downloadedBytes)
  if (install.error) return install.error
  if (install.percent == null) {
    return t('connection.driverInstallStatusUnknown', {downloaded})
  }
  return t('connection.driverInstallStatus', {
    downloaded,
    total: formatRuntimeBytes(install.totalBytes),
    percent: install.percent,
  })
})
</script>

<template>
  <AppModal
      :open="install.open"
      :title="t('connection.driverInstallTitle')"
      width="420px"
      :close-on-escape="!install.installing"
      :close-on-backdrop="false"
      @close="install.dismiss"
  >
    <div class="driver-install">
      <div class="driver-install__card">
        <div class="driver-install__head">
          <strong>{{ install.label }}</strong>
          <span v-if="install.installing" class="driver-install__spinner" aria-hidden="true"/>
        </div>
        <p class="driver-install__status">{{ statusText }}</p>
        <ProgressBar
            :value="install.percent ?? undefined"
            :aria-label="t('connection.driverInstallTitle')"
        />
      </div>
    </div>
    <template #footer>
      <DwButton variant="secondary" size="sm" @click="install.dismiss">
        {{ install.installing || !install.error
          ? t('connection.driverInstallCancel')
          : t('common.close') }}
      </DwButton>
      <DwButton
          size="sm"
          :disabled="install.installing || !install.error"
          :loading="install.installing"
          @click="install.dismiss"
      >
        {{ install.installing
          ? t('connection.driverInstallBusy')
          : install.error
            ? t('connection.driverInstallRetryHint')
            : t('connection.driverInstallDone') }}
      </DwButton>
    </template>
  </AppModal>
</template>

<style scoped>
.driver-install__card {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--dw-border);
  background: var(--dw-bg-panel);
  border-radius: var(--dw-wb-card-radius);
}

.driver-install__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.driver-install__status {
  margin: 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.driver-install__spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid var(--dw-border);
  border-top-color: var(--dw-text);
  border-radius: 50%;
  animation: driver-install-spin 0.8s linear infinite;
}

@keyframes driver-install-spin {
  to { transform: rotate(360deg); }
}
</style>

<style>
html[data-ui-skin='ide'] .driver-install__card {
  border-radius: 0;
}
</style>
