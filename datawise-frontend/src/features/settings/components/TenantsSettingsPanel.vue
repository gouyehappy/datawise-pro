<script setup lang="ts">
import {computed, onMounted, reactive, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwInput, DwSelect, DwSplitPane, FormField, ConfirmDialog, EmptyState} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'
import {DwIcon} from '@/core/icons'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import {tenantsApi, userAdminApi} from '@/api'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {localizeTenantRoleName} from '@/features/auth/services/tenant-role-label'
import {resolveDisplayApiErrorMessage} from '@/shared/api/http/api-error-message'
import type {TenantAiUsage, TenantMember, TenantSummary} from '@/shared/api/types'
import type {UserPermissionSummary} from '@/features/auth/types/feature-permission.types'
import {
  downloadTenantAiUsageExport,
  formatTenantAiUsageJson,
} from '@/features/settings/services/tenant-ai-usage-export.service'
import {buildAiCapabilityUsageRows} from '@/features/settings/services/tenant-ai-usage-breakdown'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'

const {t} = useI18n()
const toast = useAppToast()
const auth = useAuthStore()
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

function apiErrorMessage(error: unknown, fallbackKey: string) {
  return resolveDisplayApiErrorMessage(error, (key) => String(t(key))) || t(fallbackKey)
}

const tenants = ref<TenantSummary[]>([])
const users = ref<UserPermissionSummary[]>([])
const tenantRoles = ref<Array<{key: string; name: string}>>([])
const members = ref<TenantMember[]>([])
const aiUsage = ref<TenantAiUsage | null>(null)
const selectedTenantId = ref('')
const loading = ref(false)
const membersLoading = ref(false)
const aiUsageLoading = ref(false)
const saving = ref(false)
const inviting = ref(false)
const createOpen = ref(false)
const form = reactive({
  name: '',
  slug: '',
})
const invite = reactive({
  userId: '',
  roleKey: 'developer',
})

const isPlatformAdmin = computed(() => auth.platformAdmin)

const selectedTenant = computed(() =>
    tenants.value.find((item) => item.id === selectedTenantId.value) ?? null,
)

const memberCount = computed(() => members.value.length)

const showAiUsage = computed(() => {
  const current = auth.tenantId || 'default'
  return !!selectedTenant.value && selectedTenantId.value === current
})

const aiUsagePct = computed(() => {
  const usage = aiUsage.value
  if (!usage || usage.unlimited || usage.limit <= 0) return 0
  return Math.min(100, Math.round((usage.calls / usage.limit) * 100))
})

const aiUsageNearLimit = computed(() => {
  const usage = aiUsage.value
  return !!usage && !usage.unlimited && usage.limit > 0 && usage.calls / usage.limit >= 0.8
})

const aiCapabilityRows = computed(() => buildAiCapabilityUsageRows(aiUsage.value))

const roleOptions = computed<SelectOption[]>(() => {
  if (tenantRoles.value.length) {
    return tenantRoles.value.map((role) => ({
      value: role.key,
      label: localizeTenantRoleName(role.key, role.name, (key) => String(t(key))),
    }))
  }
  return ['tenant_admin', 'developer', 'analyst', 'readonly'].map((key) => ({
    value: key,
    label: localizeTenantRoleName(key, undefined, (keyPath) => String(t(keyPath))),
  }))
})

const userOptions = computed<SelectOption[]>(() => {
  const memberIds = new Set(members.value.map((m) => m.userId))
  return users.value
      .filter((user) => !user.guest && !memberIds.has(user.id))
      .map((user) => ({
        value: String(user.id),
        label: `${user.username} (#${user.id})`,
      }))
})

function roleLabel(keys?: string[]) {
  if (!keys?.length) return '—'
  return keys.map((key) => localizeTenantRoleName(key, undefined, (k) => String(t(k)))).join(', ')
}

function statusLabel(status: string) {
  const key = `settings.tenants.status.${status}`
  const label = t(key)
  return label === key ? status : label
}

function statusTone(status: string) {
  if (status === 'active') return 'ok'
  if (status === 'suspended') return 'warn'
  return 'muted'
}

function initial(text: string) {
  return (text || '?').trim().slice(0, 1).toUpperCase()
}

async function reload() {
  loading.value = true
  try {
    if (isPlatformAdmin.value) {
      const [tenantList, userList, roleList] = await Promise.all([
        tenantsApi.listAll(),
        userAdminApi.listUsers(),
        userAdminApi.listTenantRoles(),
      ])
      tenants.value = tenantList
      users.value = userList
      tenantRoles.value = roleList.map((role) => ({key: role.key, name: role.name}))
      if (!selectedTenantId.value && tenantList.length) {
        selectedTenantId.value = tenantList[0].id
      } else if (selectedTenantId.value && !tenantList.some((item) => item.id === selectedTenantId.value)) {
        selectedTenantId.value = tenantList[0]?.id ?? ''
      }
    } else {
      const currentId = auth.tenantId || 'default'
      tenants.value = [{
        id: currentId,
        slug: currentId,
        name: auth.tenantName || currentId,
        status: 'active',
      }]
      selectedTenantId.value = currentId
      const [userList, roleList] = await Promise.all([
        userAdminApi.listUsers(),
        userAdminApi.listTenantRoles(),
      ])
      users.value = userList
      tenantRoles.value = roleList.map((role) => ({key: role.key, name: role.name}))
    }
  } catch (error) {
    toast.error(apiErrorMessage(error, 'settings.tenants.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function reloadMembers() {
  if (!selectedTenantId.value) {
    members.value = []
    return
  }
  membersLoading.value = true
  try {
    members.value = await tenantsApi.listMembers(selectedTenantId.value)
  } catch (error) {
    members.value = []
    toast.error(apiErrorMessage(error, 'settings.tenants.membersLoadFailed'))
  } finally {
    membersLoading.value = false
  }
}

async function reloadAiUsage() {
  if (!showAiUsage.value) {
    aiUsage.value = null
    return
  }
  aiUsageLoading.value = true
  try {
    aiUsage.value = await tenantsApi.aiUsage()
  } catch {
    aiUsage.value = null
  } finally {
    aiUsageLoading.value = false
  }
}

async function copyAiUsage() {
  const usage = aiUsage.value
  if (!usage) return
  try {
    await navigator.clipboard.writeText(formatTenantAiUsageJson(usage))
  } catch (error) {
    toast.error(apiErrorMessage(error, 'settings.tenants.aiUsageExportFailed'))
  }
}

function downloadAiUsage() {
  const usage = aiUsage.value
  if (!usage) return
  try {
    downloadTenantAiUsageExport(usage, 'csv')
    toast.notify({
      category: 'export',
      titleKey: 'exportDone',
      bodyKey: 'exportDone',
      params: {name: t('settings.tenants.aiUsageDownloaded')},
    })
  } catch (error) {
    toast.error(apiErrorMessage(error, 'settings.tenants.aiUsageExportFailed'))
  }
}

async function createTenant() {
  if (!form.name.trim()) {
    toast.error(t('settings.tenants.nameRequired'))
    return
  }
  saving.value = true
  try {
    const created = await tenantsApi.create({
      name: form.name.trim(),
      slug: form.slug.trim() || undefined,
    })
    form.name = ''
    form.slug = ''
    createOpen.value = false
    await reload()
    selectedTenantId.value = created.id
  } catch (error) {
    toast.error(apiErrorMessage(error, 'settings.tenants.saveFailed'))
  } finally {
    saving.value = false
  }
}

async function setStatus(tenantId: string, status: string) {
  if (status === 'deleted') {
    const tenant = tenants.value.find((item) => item.id === tenantId)
    const confirmed = await askConfirm({
      title: t('settings.tenants.delete'),
      message: t('settings.tenants.deleteConfirm', {name: tenant?.name ?? tenantId}),
      confirmLabel: t('settings.tenants.delete'),
    })
    if (!confirmed) return
  }
  try {
    await tenantsApi.updateStatus(tenantId, status)
    await reload()
  } catch (error) {
    toast.error(apiErrorMessage(error, 'settings.tenants.saveFailed'))
  }
}

async function inviteMember() {
  if (!selectedTenantId.value || !invite.userId) {
    toast.error(t('settings.tenants.inviteUserRequired'))
    return
  }
  inviting.value = true
  try {
    await tenantsApi.inviteMember(selectedTenantId.value, {
      userId: Number(invite.userId),
      roleKeys: [invite.roleKey],
    })
    invite.userId = ''
    invite.roleKey = 'developer'
    await reloadMembers()
  } catch (error) {
    toast.error(apiErrorMessage(error, 'settings.tenants.saveFailed'))
  } finally {
    inviting.value = false
  }
}

async function changeMemberRole(member: TenantMember, roleKey: string) {
  if (!selectedTenantId.value || !roleKey) return
  try {
    await tenantsApi.inviteMember(selectedTenantId.value, {
      userId: member.userId,
      roleKeys: [roleKey],
    })
    await reloadMembers()
  } catch (error) {
    toast.error(apiErrorMessage(error, 'settings.tenants.saveFailed'))
  }
}

async function removeMember(member: TenantMember) {
  if (!selectedTenantId.value) return
  const confirmed = await askConfirm({
    title: t('settings.tenants.removeMember'),
    message: t('settings.tenants.removeMemberConfirm', {name: member.username}),
    confirmLabel: t('settings.tenants.removeMember'),
  })
  if (!confirmed) return
  try {
    await tenantsApi.removeMember(selectedTenantId.value, member.userId)
    await reloadMembers()
  } catch (error) {
    toast.error(apiErrorMessage(error, 'settings.tenants.saveFailed'))
  }
}

watch(selectedTenantId, () => {
  void reloadMembers()
  void reloadAiUsage()
})

onMounted(async () => {
  await reload()
  await reloadMembers()
  await reloadAiUsage()
})
</script>

<template>
  <SettingsPageShell
      width="wide"
      :title="t('settings.tenants.title')"
      :subtitle="isPlatformAdmin ? t('settings.tenants.subtitle') : t('settings.tenants.subtitleTenantAdmin')"
  >
    <DwSplitPane
        class="tn-workbench"
        storage-key="dw.split.settings-tenants"
        default-ratio="third"
        :default-width="260"
        :min-width="220"
        :max-width="480"
        :stack-below="900"
        start-class="tn-sidebar"
        end-class="tn-editor"
    >
      <template #start>
        <div class="tn-sidebar__head">
          <div>
            <h3>{{ t('settings.tenants.listTitle') }}</h3>
            <p class="hint">{{ t('settings.tenants.listHint') }}</p>
          </div>
          <DwButton
              v-if="isPlatformAdmin"
              variant="primary"
              size="sm"
              @click="createOpen = !createOpen"
          >
            {{ createOpen ? t('settings.tenants.createCancel') : t('settings.tenants.create') }}
          </DwButton>
        </div>

        <div v-if="isPlatformAdmin && createOpen" class="tn-create">
          <FormField :label="t('settings.tenants.name')">
            <DwInput v-model="form.name" :placeholder="t('settings.tenants.namePlaceholder')"/>
          </FormField>
          <FormField :label="t('settings.tenants.slug')">
            <DwInput v-model="form.slug" :placeholder="t('settings.tenants.slugPlaceholder')"/>
          </FormField>
          <p class="hint">{{ t('settings.tenants.createHint') }}</p>
          <DwButton variant="primary" size="sm" :disabled="saving" @click="createTenant">
            {{ t('settings.tenants.createConfirm') }}
          </DwButton>
        </div>

        <p v-if="loading" class="hint tn-sidebar__loading">{{ t('settings.tenants.loading') }}</p>

        <div v-else class="tn-sidebar__list" role="listbox">
          <button
              v-for="item in tenants"
              :key="item.id"
              type="button"
              class="tn-org"
              :class="{'is-active': item.id === selectedTenantId}"
              role="option"
              :aria-selected="item.id === selectedTenantId"
              @click="selectedTenantId = item.id"
          >
            <span class="tn-org__avatar" aria-hidden="true">{{ initial(item.name) }}</span>
            <span class="tn-org__copy">
              <span class="tn-org__name">{{ item.name }}</span>
              <span class="tn-org__meta">{{ item.slug }}</span>
            </span>
            <span class="tn-status" :data-tone="statusTone(item.status)">
              {{ statusLabel(item.status) }}
            </span>
          </button>
          <EmptyState
              v-if="!tenants.length"
              embedded
              compact
              class="tn-sidebar__empty"
              :title="t('settings.tenants.empty')"
          />
        </div>
      </template>

      <template #end>
        <template v-if="selectedTenant">
          <header class="tn-editor__head">
            <div class="tn-editor__title">
              <span class="tn-org__avatar tn-org__avatar--lg" aria-hidden="true">
                {{ initial(selectedTenant.name) }}
              </span>
              <div>
                <h3>{{ selectedTenant.name }}</h3>
                <p class="hint">
                  {{ selectedTenant.slug }}
                  ·
                  <span class="tn-status tn-status--inline" :data-tone="statusTone(selectedTenant.status)">
                    {{ statusLabel(selectedTenant.status) }}
                  </span>
                  ·
                  {{ t('settings.tenants.memberCount', {count: memberCount}) }}
                </p>
              </div>
            </div>
            <div v-if="isPlatformAdmin && selectedTenant.id !== 'default'" class="tn-editor__actions">
              <DwButton
                  v-if="selectedTenant.status === 'active'"
                  variant="secondary"
                  size="sm"
                  @click="setStatus(selectedTenant.id, 'suspended')"
              >
                {{ t('settings.tenants.suspend') }}
              </DwButton>
              <DwButton
                  v-if="selectedTenant.status === 'suspended'"
                  variant="secondary"
                  size="sm"
                  @click="setStatus(selectedTenant.id, 'active')"
              >
                {{ t('settings.tenants.activate') }}
              </DwButton>
              <DwButton
                  v-if="selectedTenant.status !== 'deleted'"
                  variant="danger"
                  size="sm"
                  @click="setStatus(selectedTenant.id, 'deleted')"
              >
                {{ t('settings.tenants.delete') }}
              </DwButton>
            </div>
          </header>

          <div v-if="showAiUsage" class="tn-ai-usage" :data-near="aiUsageNearLimit ? 'true' : undefined">
            <div class="tn-ai-usage__copy">
              <h4>{{ t('settings.tenants.aiUsageTitle') }}</h4>
              <p class="hint">{{ t('settings.tenants.aiUsageHint') }}</p>
            </div>
            <div class="tn-ai-usage__body">
              <p v-if="aiUsageLoading" class="hint">{{ t('settings.tenants.loading') }}</p>
              <template v-else-if="aiUsage">
                <p class="tn-ai-usage__value">
                  <template v-if="aiUsage.unlimited">
                    {{ aiUsage.calls }} · {{ t('settings.tenants.aiUsageUnlimited') }}
                  </template>
                  <template v-else>
                    {{ t('settings.tenants.aiUsageProgress', {calls: aiUsage.calls, limit: aiUsage.limit}) }}
                  </template>
                </p>
                <div v-if="!aiUsage.unlimited" class="tn-ai-usage__bar" role="progressbar" :aria-valuenow="aiUsagePct" aria-valuemin="0" aria-valuemax="100">
                  <span class="tn-ai-usage__fill" :style="{width: `${aiUsagePct}%`}"/>
                </div>
                <p v-if="aiUsageNearLimit" class="tn-ai-usage__warn">{{ t('settings.tenants.aiUsageNearLimit') }}</p>
                <ul
                    v-if="aiCapabilityRows.length"
                    class="tn-ai-usage__caps"
                    :aria-label="t('settings.tenants.aiUsageByCapability')"
                >
                  <li v-for="row in aiCapabilityRows" :key="row.id" class="tn-ai-usage__cap">
                    <span class="tn-ai-usage__cap-label">{{ t(row.labelKey) }}</span>
                    <strong class="tn-ai-usage__cap-value">{{ row.calls }}</strong>
                  </li>
                </ul>
                <div class="tn-ai-usage__actions">
                  <DwButton variant="ghost" size="sm" type="button" @click="copyAiUsage">
                    <DwIcon name="copy" size="sm" :stroke-width="1.35"/>
                    {{ t('settings.tenants.aiUsageCopy') }}
                  </DwButton>
                  <DwButton variant="ghost" size="sm" type="button" @click="downloadAiUsage">
                    <DwIcon name="export" size="sm" :stroke-width="1.35"/>
                    {{ t('settings.tenants.aiUsageDownload') }}
                  </DwButton>
                </div>
              </template>
              <p v-else class="hint">{{ t('settings.tenants.aiUsageLoadFailed') }}</p>
            </div>
          </div>

          <div class="tn-invite">
            <div class="tn-invite__copy">
              <h4>{{ t('settings.tenants.inviteTitle') }}</h4>
              <p class="hint">{{ t('settings.tenants.membersHint') }}</p>
            </div>
            <div class="tn-invite__form">
              <FormField :label="t('settings.tenants.inviteUser')">
                <DwSelect
                    v-model="invite.userId"
                    size="sm"
                    :options="userOptions"
                    :placeholder="t('settings.tenants.inviteUserPlaceholder')"
                    :disabled="!userOptions.length || selectedTenant.status !== 'active'"
                />
              </FormField>
              <FormField :label="t('settings.tenants.inviteRole')">
                <DwSelect
                    v-model="invite.roleKey"
                    size="sm"
                    :options="roleOptions"
                    :disabled="selectedTenant.status !== 'active'"
                />
              </FormField>
              <div class="tn-invite__action">
                <DwButton
                    variant="primary"
                    size="sm"
                    :disabled="inviting || !invite.userId || selectedTenant.status !== 'active'"
                    @click="inviteMember"
                >
                  {{ t('settings.tenants.invite') }}
                </DwButton>
              </div>
            </div>
          </div>

          <div class="tn-members">
            <div class="tn-members__head">
              <h4>{{ t('settings.tenants.membersListTitle') }}</h4>
            </div>
            <p v-if="membersLoading" class="hint tn-members__loading">
              {{ t('settings.tenants.membersLoading') }}
            </p>
            <EmptyState
                v-else-if="!members.length"
                embedded
                compact
                class="tn-members__empty"
                :title="t('settings.tenants.membersEmpty')"
            >
              <template #icon>
                <DwIcon name="users" :size="28" :stroke-width="1.4"/>
              </template>
            </EmptyState>
            <ul v-else class="tn-members__list">
              <li v-for="member in members" :key="member.userId" class="tn-member">
                <span class="tn-member__avatar" aria-hidden="true">{{ initial(member.username) }}</span>
                <div class="tn-member__copy">
                  <strong>{{ member.username }}</strong>
                  <span class="meta">#{{ member.userId }} · {{ roleLabel(member.roleKeys) }}</span>
                </div>
                <div class="tn-member__actions">
                  <DwSelect
                      :model-value="member.roleKeys?.[0] || 'developer'"
                      size="sm"
                      :options="roleOptions"
                      :disabled="selectedTenant.status !== 'active'"
                      @update:model-value="(value) => changeMemberRole(member, value)"
                  />
                  <DwButton
                      variant="danger"
                      size="sm"
                      :disabled="selectedTenant.status !== 'active'"
                      @click="removeMember(member)"
                  >
                    {{ t('settings.tenants.removeMember') }}
                  </DwButton>
                </div>
              </li>
            </ul>
          </div>
        </template>

        <EmptyState
            v-else-if="!loading"
            embedded
            class="tn-editor__empty"
            :title="t('settings.tenants.selectHint')"
        >
          <template #icon>
            <DwIcon name="users" :size="32" :stroke-width="1.4"/>
          </template>
        </EmptyState>
      </template>
    </DwSplitPane>
  </SettingsPageShell>

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
.tn-workbench.dw-split-pane {
  gap: var(--mp-gap-lg);
  align-items: start;
  min-height: clamp(420px, 58vh, 640px);
}

:deep(.tn-sidebar),
:deep(.tn-editor) {
  border: 1px solid var(--dw-panel-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-editor);
  box-shadow: var(--dw-panel-shadow);
  min-height: 0;
}

:deep(.tn-sidebar) {
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  max-height: clamp(420px, 58vh, 640px);
}

.tn-sidebar__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-space-3);
  padding: var(--dw-space-7);
  border-bottom: 1px solid var(--dw-border-light);
}

.tn-sidebar__head h3 {
  margin: 0;
  font-size: var(--dw-text-lg);
  font-weight: 600;
}

.tn-sidebar__head .hint,
.tn-create .hint,
.tn-editor .hint {
  margin: var(--dw-space-2) 0 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.tn-create {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-3);
  padding: var(--dw-space-5) var(--dw-space-7);
  border-bottom: 1px solid var(--dw-border-light);
  background: var(--dw-surface-muted);
}

.tn-sidebar__loading,
.tn-sidebar__empty {
  padding: var(--dw-space-6);
}

.tn-sidebar__list {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-xs);
  padding: var(--dw-space-5);
  overflow: auto;
}

.tn-org {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--dw-space-3);
  width: 100%;
  padding: var(--dw-space-3) var(--dw-space-4);
  border: 1px solid transparent;
  border-radius: var(--dw-control-radius);
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: inherit;
  transition: background var(--dw-transition-fast), border-color var(--dw-transition-fast);
}

.tn-org:hover {
  background: var(--dw-surface-muted);
}

.tn-org.is-active {
  background: var(--dw-surface-muted);
  border-color: var(--dw-border-strong);
}

.tn-org__avatar {
  display: grid;
  place-items: center;
  width: var(--dw-control-h);
  height: var(--dw-control-h);
  border-radius: var(--dw-control-radius);
  background: var(--dw-surface-raised);
  border: 1px solid var(--dw-border);
  font-size: var(--dw-text-sm);
  font-weight: 600;
  color: var(--dw-text);
}

.tn-org__avatar--lg {
  width: var(--dw-density-lg);
  height: var(--dw-density-lg);
  font-size: var(--dw-text-md);
}

.tn-org__copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.tn-org__name {
  font-weight: 600;
  font-size: var(--dw-text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tn-org__meta {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-family: var(--dw-mono);
}

.tn-status {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--dw-space-2);
  border-radius: var(--dw-control-radius-sm);
  font-size: var(--dw-text-xs);
  font-weight: 500;
  background: var(--dw-surface-muted);
  color: var(--dw-text-muted);
  white-space: nowrap;
}

.tn-status[data-tone='ok'] {
  background: color-mix(in srgb, var(--dw-success) 16%, transparent);
  color: var(--dw-success);
}

.tn-status[data-tone='warn'] {
  background: color-mix(in srgb, var(--dw-warning) 16%, transparent);
  color: var(--dw-warning);
}

.tn-status--inline {
  vertical-align: baseline;
}

.tn-editor {
  display: flex;
  flex-direction: column;
  min-height: clamp(420px, 58vh, 640px);
}

.tn-editor__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-space-4);
  padding: var(--dw-space-7);
  border-bottom: 1px solid var(--dw-border-light);
}

.tn-editor__title {
  display: flex;
  align-items: center;
  gap: var(--dw-space-4);
  min-width: 0;
}

.tn-editor__title h3 {
  margin: 0;
  font-size: var(--dw-text-lg);
  font-weight: 600;
}

.tn-editor__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-space-2);
}

.tn-ai-usage {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: var(--dw-space-5);
  align-items: start;
  padding: var(--dw-space-5) var(--dw-space-7);
  border-bottom: 1px solid var(--dw-border-light);
  background: var(--dw-surface-muted);
}

.tn-ai-usage[data-near='true'] {
  background: color-mix(in srgb, var(--dw-warning) 8%, var(--dw-surface-muted));
}

.tn-ai-usage__copy h4 {
  margin: 0;
  font-size: var(--dw-text-sm);
  font-weight: 600;
}

.tn-ai-usage__value {
  margin: 0;
  font-size: var(--dw-text-md);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.tn-ai-usage__bar {
  margin-top: var(--dw-space-3);
  height: 6px;
  border-radius: var(--dw-radius-pill);
  background: var(--dw-border-light);
  overflow: hidden;
}

.tn-ai-usage__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--dw-accent);
}

.tn-ai-usage[data-near='true'] .tn-ai-usage__fill {
  background: var(--dw-warning);
}

.tn-ai-usage__caps {
  list-style: none;
  margin: 0.55rem 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.35rem 0.75rem;
}

.tn-ai-usage__cap {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.tn-ai-usage__cap-value {
  font-weight: 600;
  color: var(--dw-text);
  font-variant-numeric: tabular-nums;
}

.tn-ai-usage__warn {
  margin: var(--dw-space-2) 0 0;
  color: var(--dw-warning);
  font-size: var(--dw-text-xs);
}

.tn-ai-usage__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-space-2);
  margin-top: var(--dw-space-3);
}

.tn-invite {
  padding: var(--dw-space-7);
  border-bottom: 1px solid var(--dw-border-light);
  background: var(--dw-surface-muted);
}

.tn-invite__copy h4,
.tn-members__head h4 {
  margin: 0;
  font-size: var(--dw-text-sm);
  font-weight: 600;
}

.tn-invite__form {
  display: grid;
  grid-template-columns: 1.5fr 1fr auto;
  gap: var(--dw-space-3);
  align-items: end;
  margin-top: var(--dw-space-4);
}

.tn-invite__action {
  padding-bottom: 2px;
}

.tn-members {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.tn-members__head {
  padding: var(--dw-space-5) var(--dw-space-7) 0;
}

.tn-members__loading {
  padding: var(--dw-space-6) var(--dw-space-7);
}

.tn-members__list {
  list-style: none;
  margin: 0;
  padding: var(--dw-space-5) var(--dw-space-7) var(--dw-space-7);
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
  overflow: auto;
}

.tn-member {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--dw-space-3);
  align-items: center;
  padding: var(--dw-space-4);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius);
  background: var(--dw-surface);
}

.tn-member__avatar {
  display: grid;
  place-items: center;
  width: var(--dw-density-lg);
  height: var(--dw-density-lg);
  border-radius: 50%;
  background: var(--dw-surface-raised);
  border: 1px solid var(--dw-border);
  font-size: var(--dw-text-sm);
  font-weight: 600;
}

.tn-member__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.tn-member__copy strong {
  font-size: var(--dw-text-sm);
}

.tn-member__copy .meta {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.tn-member__actions {
  display: flex;
  align-items: center;
  gap: var(--dw-space-2);
}

.tn-members__empty,
.tn-editor__empty {
  padding: var(--dw-space-10);
}

@media (max-width: 900px) {
  :deep(.tn-sidebar) {
    position: static;
    max-height: none;
  }

  .tn-invite__form {
    grid-template-columns: 1fr;
  }

  .tn-ai-usage {
    grid-template-columns: 1fr;
  }

  .tn-editor__head,
  .tn-member {
    grid-template-columns: 1fr;
  }

  .tn-member {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .tn-member__actions {
    width: 100%;
    justify-content: stretch;
  }
}
</style>
