<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwButton, ConfirmDialog} from '@/core/components'
import {sharesApi} from '@/api'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {resolveDisplayApiErrorMessage} from '@/shared/api/http/api-error-message'
import type {ShareSnapshot} from '@/shared/api/types'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const {t, locale} = useI18n()
const toast = useAppToast()
const loading = ref(false)
const shares = ref<ShareSnapshot[]>([])
const revokingId = ref('')
const {
  open: confirmOpen,
  title: confirmTitle,
  message: confirmMessage,
  confirmLabel,
  confirmVariant,
  ask: askConfirm,
  onConfirm: onConfirmDialog,
  onOpenUpdate: onConfirmOpenUpdate,
} = useConfirmDialog()

const activeShares = computed(() => shares.value.filter((item) => !item.revoked))

function isExpired(share: ShareSnapshot): boolean {
  if (!share.expiresAt) return false
  const expires = Date.parse(share.expiresAt)
  return Number.isFinite(expires) && expires < Date.now()
}

function statusLabel(share: ShareSnapshot): string {
  if (isExpired(share)) return t('dashboard.shares.expired')
  return t('dashboard.shares.expires', {date: formatDate(share.expiresAt)})
}

watch(
    () => props.open,
    async (isOpen) => {
      if (!isOpen) return
      await reload()
    },
)

function close() {
  emit('update:open', false)
}

async function reload() {
  loading.value = true
  try {
    shares.value = await sharesApi.listMine()
  } catch (error) {
    shares.value = []
    toast.error(
        resolveDisplayApiErrorMessage(error, (key) => String(t(key)))
        || t('dashboard.shares.loadFailed'),
    )
  } finally {
    loading.value = false
  }
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat(locale.value || undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

async function revoke(share: ShareSnapshot) {
  if (revokingId.value) return
  const confirmed = await askConfirm({
    title: t('dashboard.shares.revoke'),
    message: t('dashboard.shares.revokeConfirm'),
    confirmLabel: t('dashboard.shares.revoke'),
  })
  if (!confirmed) return
  revokingId.value = share.id
  try {
    await sharesApi.revoke(share.id)
    shares.value = shares.value.map((item) =>
        item.id === share.id ? {...item, revoked: true} : item,
    )
    toast.success(t('dashboard.shares.revoked'))
  } catch (error) {
    toast.error(
        resolveDisplayApiErrorMessage(error, (key) => String(t(key)))
        || t('dashboard.shares.revokeFailed'),
    )
  } finally {
    revokingId.value = ''
  }
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('dashboard.shares.title')"
      :subtitle="t('dashboard.shares.subtitle')"
      width="520px"
      max-height="70vh"
      close-on-backdrop
      @close="close"
  >
    <p v-if="loading" class="dash-shares__hint">{{ t('dashboard.shares.loading') }}</p>
    <ul v-else-if="activeShares.length" class="dash-shares__list">
      <li v-for="share in activeShares" :key="share.id" class="dash-shares__item">
        <div class="dash-shares__copy">
          <strong>{{ share.title }}</strong>
          <span class="dash-shares__meta" :class="{'is-expired': isExpired(share)}">
            {{ statusLabel(share) }}
          </span>
        </div>
        <DwButton
            variant="danger"
            size="sm"
            type="button"
            :disabled="revokingId === share.id"
            @click="revoke(share)"
        >
          {{ t('dashboard.shares.revoke') }}
        </DwButton>
      </li>
    </ul>
    <p v-else class="dash-shares__hint">{{ t('dashboard.shares.empty') }}</p>

    <template #footer>
      <DwButton variant="secondary" type="button" @click="close">
        {{ t('dashboard.shares.close') }}
      </DwButton>
    </template>
  </AppModal>

  <ConfirmDialog
      :open="confirmOpen"
      :title="confirmTitle"
      :message="confirmMessage"
      :confirm-label="confirmLabel"
      :confirm-variant="confirmVariant"
      @update:open="onConfirmOpenUpdate"
      @confirm="onConfirmDialog"
  />
</template>

<style scoped>
.dash-shares__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-3);
}

.dash-shares__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-4);
  padding: var(--dw-space-3) var(--dw-space-4);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-surface-muted);
}

.dash-shares__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.dash-shares__copy strong {
  font-size: var(--dw-text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dash-shares__meta {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.dash-shares__meta.is-expired {
  color: var(--dw-danger);
  font-weight: 600;
}
</style>
