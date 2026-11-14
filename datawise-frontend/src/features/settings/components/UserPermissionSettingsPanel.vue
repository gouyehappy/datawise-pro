<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {userAdminApi} from '@/api'
import {DwButton, DwCheckbox, DwInput, ConfirmDialog, DwInlineAlert, DwSplitPane, FormField, StatusPill, EmptyState, SearchInput, TagChip} from '@/core/components'
import type {StatusVariant} from '@/core/utils/status-variant'
import {DwIcon} from '@/core/icons'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {
    createPreset,
    detectPreset,
    normalizeFeaturePermissionMap,
    presetForSystemRoleKey,
} from '@/features/auth/services/feature-permission.service'
import {localizeTenantRoleName} from '@/features/auth/services/tenant-role-label'
import {FEATURE_PERMISSION_GROUPS} from '@/features/auth/constants/feature-permission-groups'
import {
    type FeaturePermissionKey,
    type FeaturePermissionMap,
    type PermissionPresetId,
    type TenantRoleSummary,
    type UserPermissionSummary,
} from '@/features/auth/types/feature-permission.types'
import {resolveDisplayApiErrorMessage} from '@/shared/api/http/api-error-message'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'

/** 账号页快捷模板 = 内置角色预设（不含 tenant_admin）。 */
const ACCOUNT_PRESETS: PermissionPresetId[] = ['developer', 'analyst', 'readonly']
/** 角色模板页可用起点。 */
const ROLE_PRESETS: PermissionPresetId[] = ['developer', 'analyst', 'readonly', 'full']
const DEFAULT_EXPANDED_GROUPS = new Set(['nav', 'workbenchConsole', 'workbenchExplorerContext'])

const {t} = useI18n()
const toast = useAppToast()
const auth = useAuthStore()
const {
    open: destructiveConfirmOpen,
    title: destructiveConfirmTitle,
    message: destructiveConfirmMessage,
    confirmLabel: destructiveConfirmLabel,
    confirmVariant: destructiveConfirmVariant,
    ask: askDestructiveConfirm,
    onConfirm: onDestructiveConfirm,
    onOpenUpdate: onDestructiveConfirmOpenUpdate,
} = useConfirmDialog()

function apiErrorMessage(error: unknown, fallbackKey: string) {
    return resolveDisplayApiErrorMessage(error, (key) => String(t(key))) || t(fallbackKey)
}

function displayRoleName(role: Pick<TenantRoleSummary, 'key' | 'name'>) {
    return localizeTenantRoleName(role.key, role.name, (key) => String(t(key)))
}

const panelMode = ref<'accounts' | 'roles'>('accounts')
/** 账号绑定：按角色 | 自定义权限（互斥）。 */
const accountBindMode = ref<'role' | 'custom'>('role')
const users = ref<UserPermissionSummary[]>([])
const roles = ref<TenantRoleSummary[]>([])
const selectedUserId = ref<number | null>(null)
const selectedRoleId = ref<string | null>(null)
const draftPermissions = ref<FeaturePermissionMap>(createPreset('readonly'))
const draftPreset = ref<PermissionPresetId>('readonly')
const draftRoleId = ref<string | null>(null)
const roleDraftName = ref('')
const roleCreateKey = ref('')
const roleCreateName = ref('')
const savedPermissionsJson = ref('')
const savedRoleId = ref<string | null>(null)
const savedBindMode = ref<'role' | 'custom'>('role')
const savedRoleName = ref('')
const loading = ref(false)
const saving = ref(false)
const creatingRole = ref(false)
const panelError = ref('')
const permissionQuery = ref('')
const expandedGroups = ref<Set<string>>(new Set(DEFAULT_EXPANDED_GROUPS))
const switchConfirmOpen = ref(false)
const pendingUserId = ref<number | null>(null)

const selectedUser = computed(() =>
    users.value.find((user) => user.id === selectedUserId.value) ?? null,
)

const selectedRole = computed(() =>
    roles.value.find((role) => role.id === selectedRoleId.value) ?? null,
)

const isAccountsMode = computed(() => panelMode.value === 'accounts')
const isRolesMode = computed(() => panelMode.value === 'roles')

const isEditable = computed(() => {
  if (isRolesMode.value) {
    return Boolean(selectedRole.value && selectedRole.value.key !== 'tenant_admin')
  }
  return Boolean(selectedUser.value && !selectedUser.value.admin)
})

const canBindRole = computed(() => Boolean(selectedUser.value && !selectedUser.value.admin && !selectedUser.value.guest))

const permissionsEditable = computed(() => {
  if (!isEditable.value) return false
  if (isRolesMode.value) return true
  if (selectedUser.value?.guest) return true
  return accountBindMode.value === 'custom'
})

const canDeleteSelectedRole = computed(() =>
    Boolean(selectedRole.value && !selectedRole.value.system && selectedRole.value.key !== 'tenant_admin'),
)

/** 可分配角色含 tenant_admin（与租户成员邀请一致）。 */
const assignableRoles = computed(() => roles.value)

const accountPresets = computed(() => ACCOUNT_PRESETS)
const rolePresets = computed(() => ROLE_PRESETS)

const showPermissionDetails = ref(false)
const roleCreateOpen = ref(false)

const selectedDraftRole = computed(() =>
    roles.value.find((role) => role.id === draftRoleId.value) ?? null,
)

const displayPermissionGroups = computed(() => {
    const seen = new Set<FeaturePermissionKey>()
    return FEATURE_PERMISSION_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => {
            if (seen.has(item.key)) return false
            seen.add(item.key)
            return true
        }),
    })).filter((group) => group.items.length > 0)
})

/** 角色模式下的能力摘要（只列有开启项的分组）。 */
const capabilitySummary = computed(() =>
    displayPermissionGroups.value
        .map((group) => ({
            id: group.id,
            labelKey: group.labelKey,
            enabled: group.items.filter((item) => draftPermissions.value[item.key]).length,
            total: group.items.length,
        }))
        .filter((group) => group.enabled > 0),
)

const totalPermissionCount = computed(() =>
    displayPermissionGroups.value.reduce((sum, group) => sum + group.items.length, 0),
)

const enabledPermissionCount = computed(() =>
    displayPermissionGroups.value.reduce(
        (sum, group) => sum + group.items.filter((item) => draftPermissions.value[item.key]).length,
        0,
    ),
)

const isRoleDirty = computed(() =>
    accountBindMode.value !== savedBindMode.value
    || draftRoleId.value !== savedRoleId.value,
)

const isPermissionsDirty = computed(
    () => JSON.stringify(draftPermissions.value) !== savedPermissionsJson.value,
)

const isRoleMetaDirty = computed(() =>
    isRolesMode.value && roleDraftName.value.trim() !== savedRoleName.value,
)

const isDirty = computed(() => {
  if (isRolesMode.value) {
    return isPermissionsDirty.value || isRoleMetaDirty.value
  }
  if (accountBindMode.value === 'role') {
    return isRoleDirty.value
  }
  return isPermissionsDirty.value || isRoleDirty.value
})

const filteredGroups = computed(() => {
    const query = permissionQuery.value.trim().toLowerCase()
    if (!query) return displayPermissionGroups.value
    return displayPermissionGroups.value
        .map((group) => ({
            ...group,
            items: group.items.filter((item) =>
                t(item.labelKey).toLowerCase().includes(query),
            ),
        }))
        .filter((group) => group.items.length > 0)
})

const allGroupsExpanded = computed(() =>
    filteredGroups.value.every((group) => expandedGroups.value.has(group.id)),
)

onMounted(() => {
    void loadUsers()
})

watch(selectedUserId, (userId) => {
    const user = users.value.find((entry) => entry.id === userId)
    if (!user) return
    syncDraftFromUser(user)
    permissionQuery.value = ''
    expandedGroups.value = new Set(DEFAULT_EXPANDED_GROUPS)
})

watch(permissionQuery, (query) => {
    if (!query.trim()) return
    expandedGroups.value = new Set(filteredGroups.value.map((group) => group.id))
})

function syncDraftFromUser(user: UserPermissionSummary) {
    const normalized = normalizeFeaturePermissionMap(user.featurePermissions)
    draftPermissions.value = normalized
    draftPreset.value = detectPreset(normalized)
    savedPermissionsJson.value = JSON.stringify(normalized)
    const primaryRole = user.roleIds?.[0] ?? null
    const useCustom = Boolean(user.guest || user.usesLegacyPermissions || !primaryRole)
    accountBindMode.value = useCustom ? 'custom' : 'role'
    savedBindMode.value = accountBindMode.value
    draftRoleId.value = useCustom ? null : primaryRole
    savedRoleId.value = draftRoleId.value
    showPermissionDetails.value = useCustom || Boolean(user.guest)
}

function syncDraftFromRole(role: TenantRoleSummary) {
    const normalized = normalizeFeaturePermissionMap(role.permissions ?? createPreset('readonly'))
    draftPermissions.value = normalized
    draftPreset.value = detectPreset(normalized)
    savedPermissionsJson.value = JSON.stringify(normalized)
    roleDraftName.value = role.name
    savedRoleName.value = role.name
    showPermissionDetails.value = true
}

async function loadUsers() {
    loading.value = true
    panelError.value = ''
    try {
        const [userList, roleList] = await Promise.all([
            userAdminApi.listUsers(),
            userAdminApi.listTenantRoles(),
        ])
        users.value = userList
        roles.value = roleList
        if (!selectedUserId.value && users.value.length > 0) {
            const firstEditable = users.value.find((user) => !user.admin) ?? users.value[0]
            selectedUserId.value = firstEditable.id
        }
        if (!selectedRoleId.value && roles.value.length > 0) {
            selectedRoleId.value = roles.value.find((role) => role.key !== 'tenant_admin')?.id
                ?? roles.value[0].id
            const role = roles.value.find((entry) => entry.id === selectedRoleId.value)
            if (role) syncDraftFromRole(role)
        }
    } catch (error) {
        panelError.value = apiErrorMessage(error, 'settings.userPermissions.loadFailed')
    } finally {
        loading.value = false
    }
}

function switchPanelMode(mode: 'accounts' | 'roles') {
    if (mode === panelMode.value) return
    if (isDirty.value) {
        panelError.value = t('settings.userPermissions.switchModeDirty')
        return
    }
    panelError.value = ''
    panelMode.value = mode
    permissionQuery.value = ''
    expandedGroups.value = new Set(DEFAULT_EXPANDED_GROUPS)
    if (mode === 'roles' && selectedRole.value) {
        syncDraftFromRole(selectedRole.value)
    } else if (mode === 'accounts' && selectedUser.value) {
        syncDraftFromUser(selectedUser.value)
    }
}

function requestSelectRole(roleId: string) {
    if (roleId === selectedRoleId.value) return
    if (isDirty.value) {
        panelError.value = t('settings.userPermissions.switchModeDirty')
        return
    }
    selectedRoleId.value = roleId
    const role = roles.value.find((entry) => entry.id === roleId)
    if (role) syncDraftFromRole(role)
}

function requestSelectUser(userId: number) {
    if (userId === selectedUserId.value) return
    if (isDirty.value) {
        pendingUserId.value = userId
        switchConfirmOpen.value = true
        return
    }
    selectedUserId.value = userId
}

function confirmSwitchUser() {
    if (pendingUserId.value != null) {
        selectedUserId.value = pendingUserId.value
    }
    pendingUserId.value = null
    switchConfirmOpen.value = false
}

function cancelSwitchUser() {
    pendingUserId.value = null
    switchConfirmOpen.value = false
}

function applyPreset(preset: PermissionPresetId) {
    if (!permissionsEditable.value || preset === 'custom') return
    draftPreset.value = preset
    draftPermissions.value = createPreset(preset)
}

function enterCustomBindMode() {
    if (!isEditable.value || !canBindRole.value) return
    if (accountBindMode.value === 'custom') return
    accountBindMode.value = 'custom'
    draftRoleId.value = null
    draftPreset.value = detectPreset(draftPermissions.value)
    showPermissionDetails.value = true
}

function enterRoleBindMode() {
    if (!isEditable.value || !canBindRole.value) return
    if (accountBindMode.value === 'role') return
    accountBindMode.value = 'role'
    const preferred =
        draftRoleId.value
        ?? roles.value.find((role) => role.key === 'developer')?.id
        ?? roles.value.find((role) => role.key !== 'tenant_admin')?.id
        ?? roles.value[0]?.id
        ?? null
    if (preferred) onRoleChange(preferred)
    showPermissionDetails.value = false
}

function roleCardHint(role: TenantRoleSummary) {
    const preset = presetForSystemRoleKey(role.key)
    if (preset && preset !== 'custom') {
        return t(`settings.userPermissions.presetHints.${preset}`)
    }
    return t('settings.userPermissions.customRoleCardHint')
}

function initial(text: string) {
    return (text || '?').trim().slice(0, 1).toUpperCase()
}

function accountBindingTone(user: UserPermissionSummary): StatusVariant {
    if (user.admin) return 'neutral'
    if (user.guest || accountBindMode.value === 'custom') return 'warn'
    return 'success'
}

function accountBindingLabel(user: UserPermissionSummary) {
    if (user.admin) return t('settings.userPermissions.adminBadge')
    if (user.guest) return t('settings.userPermissions.guestBadge')
    if (accountBindMode.value === 'custom') return t('settings.userPermissions.bindCustom')
    if (selectedDraftRole.value) return displayRoleName(selectedDraftRole.value)
    return t('settings.userPermissions.unassignedBadge')
}

function saveActionLabel() {
    if (isRolesMode.value) return t('settings.userPermissions.saveRole')
    if (accountBindMode.value === 'role') return t('settings.userPermissions.saveRoleAssign')
    return t('settings.userPermissions.saveCustom')
}

function togglePermission(key: FeaturePermissionKey, enabled: boolean) {
    if (!permissionsEditable.value) return
    draftPreset.value = 'custom'
    draftPermissions.value = normalizeFeaturePermissionMap({
        ...draftPermissions.value,
        [key]: enabled,
    })
}

function setGroupPermissions(groupId: string, enabled: boolean) {
    if (!permissionsEditable.value) return
    const group = displayPermissionGroups.value.find((entry) => entry.id === groupId)
    if (!group) return
    draftPreset.value = 'custom'
    const next = {...draftPermissions.value}
    for (const item of group.items) {
        next[item.key] = enabled
    }
    draftPermissions.value = normalizeFeaturePermissionMap(next)
}

function groupEnabledCount(groupId: string): number {
    const group = displayPermissionGroups.value.find((entry) => entry.id === groupId)
    if (!group) return 0
    return group.items.filter((item) => draftPermissions.value[item.key]).length
}

function toggleGroupExpanded(groupId: string) {
    const next = new Set(expandedGroups.value)
    if (next.has(groupId)) next.delete(groupId)
    else next.add(groupId)
    expandedGroups.value = next
}

function setAllGroupsExpanded(expanded: boolean) {
    expandedGroups.value = expanded
        ? new Set(filteredGroups.value.map((group) => group.id))
        : new Set<string>()
}

function accountMeta(user: UserPermissionSummary): string {
    if (user.admin) return t('settings.userPermissions.adminBadge')
    if (user.guest) return t('settings.userPermissions.guestBadge')
    if (user.usesLegacyPermissions) {
        return t('settings.userPermissions.customBindBadge')
    }
    const roleKey = user.roleKeys?.[0]
    if (roleKey) {
        const storedName = roles.value.find((role) => role.key === roleKey)?.name
        return localizeTenantRoleName(roleKey, storedName, (key) => String(t(key)))
    }
    return t('settings.userPermissions.unassignedBadge')
}

function onRoleChange(roleId: string) {
    draftRoleId.value = roleId || null
    accountBindMode.value = 'role'
    const role = roles.value.find((entry) => entry.id === roleId)
    if (!role?.permissions) return
    const normalized = normalizeFeaturePermissionMap(role.permissions)
    draftPermissions.value = normalized
    const fromKey = presetForSystemRoleKey(role.key)
    draftPreset.value = fromKey ?? detectPreset(normalized)
}

async function savePermissions() {
    if (isRolesMode.value) {
        await saveRole()
        return
    }
    if (!selectedUser.value || !isEditable.value || saving.value || !isDirty.value) return
    saving.value = true
    panelError.value = ''
    try {
        let updated: UserPermissionSummary | null = null
        if (selectedUser.value.guest || accountBindMode.value === 'custom') {
            updated = await userAdminApi.updateUserPermissions(
                selectedUser.value.id,
                normalizeFeaturePermissionMap(draftPermissions.value),
            )
        } else {
            if (!draftRoleId.value) {
                panelError.value = t('settings.userPermissions.roleRequired')
                return
            }
            updated = await userAdminApi.updateUserRoles(selectedUser.value.id, [draftRoleId.value])
        }
        if (!updated) return
        applyUserSummary(updated)
        const affectsCurrentSession =
            (auth.isGuest && updated.guest) ||
            (auth.user?.userId != null && auth.user.userId === updated.id)
        if (affectsCurrentSession) {
            await auth.refreshSessionPermissions()
        } else if (updated.guest) {
            toast.show(t('settings.userPermissions.guestReLoginHint'), {variant: 'info'})
        } else {
        }
    } catch (error) {
        panelError.value = apiErrorMessage(error, 'settings.userPermissions.saveFailed')
    } finally {
        saving.value = false
    }
}

function applyUserSummary(updated: UserPermissionSummary) {
    const resolved = normalizeFeaturePermissionMap(updated.featurePermissions)
    users.value = users.value.map((user) =>
        user.id === updated.id ? {...updated, featurePermissions: resolved} : user,
    )
    syncDraftFromUser({...updated, featurePermissions: resolved})
}

async function saveRole() {
    if (!selectedRole.value || !isEditable.value || saving.value || !isDirty.value) return
    if (!roleDraftName.value.trim()) {
        panelError.value = t('settings.userPermissions.roleNameRequired')
        return
    }
    saving.value = true
    panelError.value = ''
    try {
        const updated = await userAdminApi.updateTenantRole(selectedRole.value.id, {
            name: roleDraftName.value.trim(),
            permissions: normalizeFeaturePermissionMap(draftPermissions.value),
        })
        roles.value = roles.value.map((role) => (role.id === updated.id ? updated : role))
        syncDraftFromRole(updated)
    } catch (error) {
        panelError.value = apiErrorMessage(error, 'settings.userPermissions.saveFailed')
    } finally {
        saving.value = false
    }
}

async function createCustomRole() {
    const key = roleCreateKey.value.trim().toLowerCase()
    const name = roleCreateName.value.trim()
    if (!key || !name) {
        panelError.value = t('settings.userPermissions.roleCreateRequired')
        return
    }
    creatingRole.value = true
    panelError.value = ''
    try {
        const created = await userAdminApi.createTenantRole({
            key,
            name,
            permissions: createPreset('developer'),
        })
        roles.value = [...roles.value, created].sort((a, b) => a.key.localeCompare(b.key))
        roleCreateKey.value = ''
        roleCreateName.value = ''
        selectedRoleId.value = created.id
        syncDraftFromRole(created)
        roleCreateOpen.value = false
    } catch (error) {
        panelError.value = apiErrorMessage(error, 'settings.userPermissions.saveFailed')
    } finally {
        creatingRole.value = false
    }
}

async function deleteSelectedRole() {
    if (!selectedRole.value || !canDeleteSelectedRole.value) return
    const role = selectedRole.value
    const confirmed = await askDestructiveConfirm({
        title: t('settings.userPermissions.deleteRole'),
        message: t('settings.userPermissions.deleteRoleConfirm', {name: displayRoleName(role)}),
        confirmLabel: t('settings.userPermissions.deleteRole'),
    })
    if (!confirmed) return
    saving.value = true
    panelError.value = ''
    try {
        const roleId = role.id
        await userAdminApi.deleteTenantRole(roleId)
        roles.value = roles.value.filter((item) => item.id !== roleId)
        selectedRoleId.value = roles.value.find((item) => item.key !== 'tenant_admin')?.id
            ?? roles.value[0]?.id
            ?? null
        if (selectedRole.value) {
            syncDraftFromRole(selectedRole.value)
        }
    } catch (error) {
        panelError.value = apiErrorMessage(error, 'settings.userPermissions.saveFailed')
    } finally {
        saving.value = false
    }
}
</script>

<template>
  <SettingsPageShell
      width="wide"
      :title="t('settings.userPermissions.title')"
      :subtitle="t('settings.userPermissions.subtitle')"
  >
    <template #actions>
      <div class="dw-segment perm-actions-segment" role="tablist">
        <button
            type="button"
            class="dw-segment__btn"
            :class="{'is-active': isAccountsMode}"
            role="tab"
            :aria-selected="isAccountsMode"
            @click="switchPanelMode('accounts')"
        >
          {{ t('settings.userPermissions.modeAccounts') }}
        </button>
        <button
            type="button"
            class="dw-segment__btn"
            :class="{'is-active': isRolesMode}"
            role="tab"
            :aria-selected="isRolesMode"
            @click="switchPanelMode('roles')"
        >
          {{ t('settings.userPermissions.modeRoles') }}
        </button>
      </div>
      <StatusPill v-if="isDirty && isEditable" variant="warn" inline>
        {{ t('settings.userPermissions.unsavedBadge') }}
      </StatusPill>
      <DwButton
          v-if="isEditable"
          variant="primary"
          size="sm"
          :disabled="saving || !isDirty"
          :loading="saving"
          @click="savePermissions"
      >
        {{ saveActionLabel() }}
      </DwButton>
    </template>

    <DwInlineAlert :message="panelError"/>

    <DwSplitPane
        class="perm-workbench"
        storage-key="dw.split.settings-permissions"
        default-ratio="third"
        :default-width="260"
        :min-width="220"
        :max-width="480"
        :stack-below="900"
        start-class="perm-sidebar"
        end-class="perm-editor"
    >
      <template #start>
        <template v-if="isAccountsMode">
          <div class="perm-sidebar__head">
            <div>
              <h3>{{ t('settings.userPermissions.accountsTitle') }}</h3>
              <p class="hint">{{ t('settings.userPermissions.accountsHint') }}</p>
            </div>
          </div>

          <p v-if="loading" class="hint perm-sidebar__loading">
            {{ t('settings.userPermissions.loading') }}
          </p>

          <div
              v-else
              class="perm-sidebar__list"
              role="listbox"
              :aria-label="t('settings.userPermissions.accountsTitle')"
          >
            <button
                v-for="user in users"
                :key="user.id"
                type="button"
                class="perm-list-item"
                :class="{
                  'is-active': selectedUserId === user.id,
                  'is-locked': user.admin,
                }"
                role="option"
                :aria-selected="selectedUserId === user.id"
                @click="requestSelectUser(user.id)"
            >
              <span class="mp-avatar" aria-hidden="true">
                {{ initial(user.displayName) }}
              </span>
              <span class="perm-list-item__copy">
                <span class="perm-list-item__name">{{ user.displayName }}</span>
                <span class="perm-list-item__meta">{{ accountMeta(user) }}</span>
              </span>
              <DwIcon
                  v-if="user.admin"
                  name="lock"
                  class="perm-list-item__lock"
                  size="sm"
                  :stroke-width="1.6"
              />
            </button>
          </div>
        </template>

        <template v-else>
          <div class="perm-sidebar__head">
            <div>
              <h3>{{ t('settings.userPermissions.rolesTitle') }}</h3>
              <p class="hint">{{ t('settings.userPermissions.rolesHint') }}</p>
            </div>
          </div>

          <div class="perm-role-create">
            <button
                type="button"
                class="perm-role-create__toggle"
                :class="{'is-open': roleCreateOpen}"
                @click="roleCreateOpen = !roleCreateOpen"
            >
              <DwIcon :name="roleCreateOpen ? 'chevron-down' : 'plus'" size="sm" :stroke-width="1.6"/>
              {{ t('settings.userPermissions.createRoleToggle') }}
            </button>
            <div v-if="roleCreateOpen" class="perm-role-create__form">
              <DwInput
                  v-model="roleCreateKey"
                  :placeholder="t('settings.userPermissions.roleKeyPlaceholder')"
              />
              <DwInput
                  v-model="roleCreateName"
                  :placeholder="t('settings.userPermissions.roleNamePlaceholder')"
              />
              <DwButton
                  variant="primary"
                  size="sm"
                  :disabled="creatingRole"
                  @click="createCustomRole"
              >
                {{ t('settings.userPermissions.createRole') }}
              </DwButton>
            </div>
          </div>

          <p v-if="loading" class="hint perm-sidebar__loading">
            {{ t('settings.userPermissions.loading') }}
          </p>

          <div
              v-else
              class="perm-sidebar__list"
              role="listbox"
              :aria-label="t('settings.userPermissions.rolesTitle')"
          >
            <button
                v-for="role in roles"
                :key="role.id"
                type="button"
                class="perm-list-item"
                :class="{
                  'is-active': selectedRoleId === role.id,
                  'is-locked': role.key === 'tenant_admin',
                }"
                role="option"
                :aria-selected="selectedRoleId === role.id"
                @click="requestSelectRole(role.id)"
            >
              <span class="mp-avatar" aria-hidden="true">
                {{ initial(displayRoleName(role)) }}
              </span>
              <span class="perm-list-item__copy">
                <span class="perm-list-item__name">{{ displayRoleName(role) }}</span>
                <span class="perm-list-item__meta">
                  {{ role.system ? t('settings.userPermissions.systemRoleBadge') : role.key }}
                </span>
              </span>
              <DwIcon
                  v-if="role.key === 'tenant_admin'"
                  name="lock"
                  class="perm-list-item__lock"
                  size="sm"
                  :stroke-width="1.6"
              />
            </button>
          </div>
        </template>
      </template>

      <template #end>
        <template v-if="isAccountsMode && selectedUser">
          <header class="perm-editor__head">
            <div class="perm-editor__title">
              <span class="mp-avatar perm-avatar--lg" aria-hidden="true">
                {{ initial(selectedUser.displayName) }}
              </span>
              <div class="perm-editor__title-copy">
                <h3>{{ selectedUser.displayName }}</h3>
                <p class="hint">
                  <StatusPill :variant="accountBindingTone(selectedUser)" inline>
                    {{ accountBindingLabel(selectedUser) }}
                  </StatusPill>
                  <template v-if="!selectedUser.admin">
                    <span class="perm-dot" aria-hidden="true">·</span>
                    {{ t('settings.userPermissions.permissionSummary', {
                      enabled: enabledPermissionCount,
                      total: totalPermissionCount,
                    }) }}
                  </template>
                </p>
              </div>
            </div>
          </header>

          <p v-if="selectedUser.admin" class="guest-notice guest-notice--embedded">
            {{ t('settings.userPermissions.adminLocked') }}
          </p>

          <template v-else>
            <div v-if="canBindRole" class="perm-section perm-section--compact">
              <div class="dw-segment" role="tablist">
                <button
                    type="button"
                    class="dw-segment__btn"
                    :class="{'is-active': accountBindMode === 'role'}"
                    role="tab"
                    :aria-selected="accountBindMode === 'role'"
                    @click="enterRoleBindMode"
                >
                  {{ t('settings.userPermissions.bindRole') }}
                </button>
                <button
                    type="button"
                    class="dw-segment__btn"
                    :class="{'is-active': accountBindMode === 'custom'}"
                    role="tab"
                    :aria-selected="accountBindMode === 'custom'"
                    @click="enterCustomBindMode"
                >
                  {{ t('settings.userPermissions.bindCustom') }}
                </button>
              </div>
              <p class="hint perm-section__hint">
                {{
                  accountBindMode === 'role'
                      ? t('settings.userPermissions.stepAssignRoleDesc')
                      : t('settings.userPermissions.customBindHint')
                }}
              </p>
            </div>

            <div v-if="canBindRole && accountBindMode === 'role'" class="perm-section">
              <div class="perm-role-list" role="radiogroup">
                <button
                    v-for="role in assignableRoles"
                    :key="role.id"
                    type="button"
                    class="perm-role-option"
                    :class="{'is-active': draftRoleId === role.id}"
                    role="radio"
                    :aria-checked="draftRoleId === role.id"
                    @click="onRoleChange(role.id)"
                >
                  <span class="perm-role-option__check" aria-hidden="true">
                    <DwIcon
                        v-if="draftRoleId === role.id"
                        name="check"
                        size="sm"
                        :stroke-width="2"
                    />
                  </span>
                  <span class="perm-role-option__copy">
                    <span class="perm-role-option__name">{{ displayRoleName(role) }}</span>
                    <span class="perm-role-option__hint">{{ roleCardHint(role) }}</span>
                  </span>
                </button>
              </div>

              <div class="perm-capability">
                <div class="perm-capability__head">
                  <span class="perm-capability__label">
                    {{ t('settings.userPermissions.capabilityOverview') }}
                  </span>
                  <DwButton
                      variant="ghost"
                      size="sm"
                      @click="showPermissionDetails = !showPermissionDetails"
                  >
                    <DwIcon
                        :name="showPermissionDetails ? 'chevron-down' : 'chevron-right'"
                        size="sm"
                        :stroke-width="2.25"
                    />
                    {{
                      showPermissionDetails
                          ? t('settings.userPermissions.hideDetails')
                          : t('settings.userPermissions.viewDetails')
                    }}
                  </DwButton>
                </div>
                <div v-if="!showPermissionDetails && capabilitySummary.length" class="perm-capability__chips">
                  <TagChip v-for="item in capabilitySummary" :key="item.id">
                    {{ t(item.labelKey) }} · {{ item.enabled }}/{{ item.total }}
                  </TagChip>
                </div>
              </div>
            </div>

            <div v-else class="perm-section">
              <p v-if="selectedUser.guest" class="hint perm-section__hint">
                {{ t('settings.userPermissions.customHint') }}
              </p>
              <div class="perm-preset-row">
                <span class="perm-preset-row__label">{{ t('settings.userPermissions.presetLabel') }}</span>
                <div class="dw-segment perm-preset-segment" role="group">
                  <button
                      v-for="preset in accountPresets"
                      :key="preset"
                      type="button"
                      class="dw-segment__btn"
                      :class="{'is-active': draftPreset === preset}"
                      @click="applyPreset(preset)"
                  >
                    {{ t(`settings.userPermissions.presets.${preset}`) }}
                  </button>
                </div>
              </div>
            </div>

            <div
                v-if="showPermissionDetails || accountBindMode === 'custom' || selectedUser.guest"
                class="perm-matrix"
            >
              <div class="perm-matrix__toolbar">
                <SearchInput
                    v-model="permissionQuery"
                    class="perm-matrix__search"
                    size="sm"
                    :placeholder="t('settings.userPermissions.searchPlaceholder')"
                />
                <DwButton
                    variant="ghost"
                    size="sm"
                    @click="setAllGroupsExpanded(!allGroupsExpanded)"
                >
                  {{
                    allGroupsExpanded
                        ? t('settings.userPermissions.collapseAll')
                        : t('settings.userPermissions.expandAll')
                  }}
                </DwButton>
              </div>

              <p v-if="!permissionsEditable && accountBindMode === 'role'" class="hint perm-matrix__hint">
                {{ t('settings.userPermissions.rolePreviewHint') }}
              </p>

              <EmptyState
                  v-if="!filteredGroups.length"
                  class="perm-matrix__empty"
                  embedded
                  compact
                  :title="t('settings.userPermissions.noSearchResults')"
              />

              <div v-else class="perm-groups">
                <section
                    v-for="group in filteredGroups"
                    :key="group.id"
                    class="perm-group"
                    :class="{'is-expanded': expandedGroups.has(group.id)}"
                >
                  <button
                      type="button"
                      class="perm-group__head"
                      :aria-expanded="expandedGroups.has(group.id)"
                      @click="toggleGroupExpanded(group.id)"
                  >
                    <DwIcon
                        class="perm-group__chevron"
                        name="chevron-down"
                        size="sm"
                        :stroke-width="2.25"
                    />
                    <span class="perm-group__title">{{ t(group.labelKey) }}</span>
                    <StatusPill variant="neutral" chip>
                      {{ groupEnabledCount(group.id) }}/{{ group.items.length }}
                    </StatusPill>
                    <span v-if="permissionsEditable" class="perm-group__actions" @click.stop>
                      <DwButton
                          variant="ghost"
                          size="sm"
                          @click="setGroupPermissions(group.id, true)"
                      >
                        {{ t('settings.userPermissions.enableGroup') }}
                      </DwButton>
                      <DwButton
                          variant="ghost"
                          size="sm"
                          @click="setGroupPermissions(group.id, false)"
                      >
                        {{ t('settings.userPermissions.disableGroup') }}
                      </DwButton>
                    </span>
                  </button>

                  <div v-show="expandedGroups.has(group.id)" class="perm-group__body">
                    <div class="perm-check-grid">
                      <DwCheckbox
                          v-for="item in group.items"
                          :key="item.key"
                          class="perm-check"
                          :model-value="draftPermissions[item.key]"
                          :disabled="!permissionsEditable"
                          @update:model-value="togglePermission(item.key, $event)"
                      >
                        {{ t(item.labelKey) }}
                      </DwCheckbox>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </template>
        </template>

        <template v-else-if="isRolesMode && selectedRole">
          <header class="perm-editor__head perm-editor__head--row">
            <div class="perm-editor__title">
              <span class="mp-avatar perm-avatar--lg" aria-hidden="true">
                {{ initial(displayRoleName(selectedRole)) }}
              </span>
              <div class="perm-editor__title-copy">
                <h3>{{ displayRoleName(selectedRole) }}</h3>
                <p class="hint">
                  <StatusPill
                      :variant="selectedRole.key === 'tenant_admin' ? 'neutral' : 'success'"
                      inline
                  >
                    {{
                      selectedRole.system
                          ? t('settings.userPermissions.systemRoleBadge')
                          : t('settings.userPermissions.customRoleCardHint')
                    }}
                  </StatusPill>
                  <template v-if="selectedRole.key !== 'tenant_admin'">
                    <span class="perm-dot" aria-hidden="true">·</span>
                    {{ t('settings.userPermissions.permissionSummary', {
                      enabled: enabledPermissionCount,
                      total: totalPermissionCount,
                    }) }}
                  </template>
                </p>
              </div>
            </div>
            <DwButton
                v-if="canDeleteSelectedRole"
                variant="danger"
                size="sm"
                :disabled="saving"
                @click="deleteSelectedRole"
            >
              {{ t('settings.userPermissions.deleteRole') }}
            </DwButton>
          </header>

          <p v-if="selectedRole.key === 'tenant_admin'" class="guest-notice guest-notice--embedded">
            {{ t('settings.userPermissions.tenantAdminRoleLocked') }}
          </p>

          <template v-else>
            <div class="perm-section">
              <div class="perm-role-meta">
                <FormField :label="t('settings.userPermissions.roleName')">
                  <DwInput v-model="roleDraftName"/>
                </FormField>
                <p class="hint">{{ t('settings.userPermissions.roleKeyReadonly', {key: selectedRole.key}) }}</p>
              </div>
              <div class="perm-preset-row">
                <span class="perm-preset-row__label">{{ t('settings.userPermissions.presetLabel') }}</span>
                <div class="dw-segment perm-preset-segment" role="group">
                  <button
                      v-for="preset in rolePresets"
                      :key="preset"
                      type="button"
                      class="dw-segment__btn"
                      :class="{'is-active': draftPreset === preset}"
                      @click="applyPreset(preset)"
                  >
                    {{ t(`settings.userPermissions.presets.${preset}`) }}
                  </button>
                </div>
              </div>
            </div>

            <div class="perm-matrix">
              <div class="perm-matrix__toolbar">
                <SearchInput
                    v-model="permissionQuery"
                    class="perm-matrix__search"
                    size="sm"
                    :placeholder="t('settings.userPermissions.searchPlaceholder')"
                />
                <DwButton
                    variant="ghost"
                    size="sm"
                    @click="setAllGroupsExpanded(!allGroupsExpanded)"
                >
                  {{
                    allGroupsExpanded
                        ? t('settings.userPermissions.collapseAll')
                        : t('settings.userPermissions.expandAll')
                  }}
                </DwButton>
              </div>

              <div class="perm-groups">
                <section
                    v-for="group in filteredGroups"
                    :key="group.id"
                    class="perm-group"
                    :class="{'is-expanded': expandedGroups.has(group.id)}"
                >
                  <button
                      type="button"
                      class="perm-group__head"
                      :aria-expanded="expandedGroups.has(group.id)"
                      @click="toggleGroupExpanded(group.id)"
                  >
                    <DwIcon
                        class="perm-group__chevron"
                        name="chevron-down"
                        size="sm"
                        :stroke-width="2.25"
                    />
                    <span class="perm-group__title">{{ t(group.labelKey) }}</span>
                    <StatusPill variant="neutral" chip>
                      {{ groupEnabledCount(group.id) }}/{{ group.items.length }}
                    </StatusPill>
                    <span class="perm-group__actions" @click.stop>
                      <DwButton
                          variant="ghost"
                          size="sm"
                          @click="setGroupPermissions(group.id, true)"
                      >
                        {{ t('settings.userPermissions.enableGroup') }}
                      </DwButton>
                      <DwButton
                          variant="ghost"
                          size="sm"
                          @click="setGroupPermissions(group.id, false)"
                      >
                        {{ t('settings.userPermissions.disableGroup') }}
                      </DwButton>
                    </span>
                  </button>
                  <div v-show="expandedGroups.has(group.id)" class="perm-group__body">
                    <div class="perm-check-grid">
                      <DwCheckbox
                          v-for="item in group.items"
                          :key="item.key"
                          class="perm-check"
                          :model-value="draftPermissions[item.key]"
                          @update:model-value="togglePermission(item.key, $event)"
                      >
                        {{ t(item.labelKey) }}
                      </DwCheckbox>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </template>
        </template>

        <EmptyState
            v-else-if="!loading"
            class="perm-editor__empty"
            embedded
            compact
            :title="isRolesMode
              ? t('settings.userPermissions.selectRoleHint')
              : t('settings.userPermissions.selectAccountHint')"
        >
          <template #icon>
            <DwIcon name="users" :size="28" :stroke-width="1.4"/>
          </template>
        </EmptyState>
      </template>
    </DwSplitPane>

    <footer
        v-if="isEditable && isDirty"
        class="perm-save-bar"
    >
      <p class="hint perm-save-bar__hint">
        {{
          isRolesMode
              ? t('settings.userPermissions.roleTemplateHint')
              : accountBindMode === 'role'
                  ? t('settings.userPermissions.roleSaveHint')
                  : t('settings.userPermissions.customSaveHint')
        }}
      </p>
      <DwButton
          variant="primary"
          size="sm"
          :disabled="saving"
          :loading="saving"
          @click="savePermissions"
      >
        {{ saveActionLabel() }}
      </DwButton>
    </footer>

    <ConfirmDialog
        v-model:open="switchConfirmOpen"
        :title="t('settings.userPermissions.unsavedSwitchTitle')"
        :message="t('settings.userPermissions.unsavedConfirm')"
        :confirm-label="t('settings.userPermissions.unsavedSwitchConfirm')"
        @update:open="(open) => { if (!open) cancelSwitchUser() }"
        @confirm="confirmSwitchUser"
    />
    <ConfirmDialog
        :open="destructiveConfirmOpen"
        :title="destructiveConfirmTitle"
        :message="destructiveConfirmMessage"
        :confirm-label="destructiveConfirmLabel"
        :confirm-variant="destructiveConfirmVariant"
        @update:open="onDestructiveConfirmOpenUpdate"
        @confirm="onDestructiveConfirm"
    />
  </SettingsPageShell>
</template>

<style scoped>
.perm-workbench.dw-split-pane {
  gap: var(--mp-gap-lg);
  align-items: start;
  min-height: clamp(26rem, 58vh, 40rem);
}

.perm-actions-segment {
  margin-right: var(--dw-space-2);
}

:deep(.perm-sidebar),
:deep(.perm-editor),
.perm-save-bar {
  border: 1px solid var(--dw-panel-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-editor);
  box-shadow: var(--dw-panel-shadow);
  min-height: 0;
}

:deep(.perm-sidebar) {
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  max-height: clamp(26rem, 58vh, 40rem);
}

.perm-sidebar__head {
  padding: var(--dw-space-7);
  border-bottom: 1px solid var(--dw-border-light);
}

.perm-sidebar__head h3 {
  margin: 0;
  font-size: var(--dw-text-lg);
  font-weight: 600;
}

.perm-sidebar__head .hint,
.perm-editor .hint,
.perm-role-create .hint {
  margin: var(--dw-space-2) 0 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.perm-sidebar__loading {
  padding: var(--dw-space-6);
}

.perm-sidebar__list {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-xs);
  padding: var(--dw-space-5);
  overflow: auto;
}

.perm-role-create {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-3);
  padding: var(--dw-space-4) var(--dw-space-5);
  border-bottom: 1px solid var(--dw-border-light);
  background: var(--dw-surface-muted);
}

.perm-role-create__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-2);
  align-self: flex-start;
  border: 1px dashed var(--dw-border);
  border-radius: var(--dw-control-radius);
  padding: var(--dw-space-2) var(--dw-space-4);
  background: var(--dw-surface);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: var(--dw-transition-colors);
}

.perm-role-create__toggle:hover,
.perm-role-create__toggle.is-open {
  border-color: var(--dw-border-strong);
  color: var(--dw-text);
}

.perm-role-create__form {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
}

.perm-list-item {
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
  transition: var(--dw-transition-colors);
}

.perm-list-item:hover {
  background: var(--dw-surface-muted);
}

.perm-list-item.is-active {
  background: var(--dw-surface-muted);
  border-color: var(--dw-border-strong);
}

.perm-list-item.is-locked {
  opacity: 0.9;
}

.perm-list-item__copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: var(--dw-space-1);
}

.perm-list-item__name {
  font-weight: 600;
  font-size: var(--dw-text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.perm-list-item__meta {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.perm-list-item__lock {
  color: var(--dw-text-muted);
}

.perm-avatar--lg {
  width: calc(var(--dw-space-12) + var(--dw-space-4));
  height: calc(var(--dw-space-12) + var(--dw-space-4));
  font-size: var(--dw-text-md);
}

:deep(.perm-editor) {
  display: flex;
  flex-direction: column;
  min-height: clamp(26rem, 58vh, 40rem);
}

.perm-editor__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-space-4);
  padding: var(--dw-space-7);
  border-bottom: 1px solid var(--dw-border-light);
}

.perm-editor__title {
  display: flex;
  align-items: center;
  gap: var(--dw-space-4);
  min-width: 0;
}

.perm-editor__title-copy {
  min-width: 0;
}

.perm-editor__title h3 {
  margin: 0;
  font-size: var(--dw-text-lg);
  font-weight: 600;
}

.perm-editor__title .hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-space-2);
  margin-top: var(--dw-space-2);
}

.perm-dot {
  color: var(--dw-text-muted);
}

.perm-section {
  display: grid;
  gap: var(--dw-space-4);
  padding: var(--dw-space-6) var(--dw-space-7);
  border-bottom: 1px solid var(--dw-border-light);
}

.perm-section--compact {
  gap: var(--dw-space-3);
  background: color-mix(in srgb, var(--dw-surface-muted) 65%, transparent);
}

.perm-section__hint {
  margin: 0;
}

.perm-role-list {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
}

.perm-role-option {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: flex-start;
  gap: var(--dw-space-3);
  width: 100%;
  padding: var(--dw-space-4) var(--dw-space-5);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius);
  background: var(--dw-surface);
  text-align: left;
  cursor: pointer;
  color: inherit;
  transition: var(--dw-transition-colors), box-shadow var(--dw-duration-fast) var(--dw-ease);
}

.perm-role-option:hover {
  border-color: color-mix(in srgb, var(--dw-primary) 35%, var(--dw-border));
}

.perm-role-option.is-active {
  border-color: color-mix(in srgb, var(--dw-primary) 50%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-primary) 7%, var(--dw-surface));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dw-primary) 18%, transparent);
}

.perm-role-option__check {
  display: grid;
  place-items: center;
  width: var(--dw-space-6);
  height: var(--dw-space-6);
  margin-top: var(--dw-space-1);
  border-radius: 50%;
  border: 1px solid var(--dw-border);
  background: var(--dw-surface);
  color: var(--dw-primary);
}

.perm-role-option.is-active .perm-role-option__check {
  border-color: var(--dw-primary);
  background: color-mix(in srgb, var(--dw-primary) 12%, var(--dw-surface));
}

.perm-role-option__copy {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
  min-width: 0;
}

.perm-role-option__name {
  font-size: var(--dw-text-sm);
  font-weight: 650;
  color: var(--dw-text);
}

.perm-role-option__hint {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: var(--dw-leading-relaxed);
}

.perm-capability {
  display: grid;
  gap: var(--dw-space-3);
  padding: var(--dw-space-4);
  border-radius: var(--dw-control-radius);
  background: var(--dw-surface-muted);
}

.perm-capability__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap-sm);
}

.perm-capability__label {
  font-size: var(--dw-text-sm);
  font-weight: 600;
  color: var(--dw-text-secondary);
}

.perm-capability__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-space-2);
}

.perm-role-meta {
  display: grid;
  gap: var(--dw-space-2);
  max-width: 28rem;
}

.perm-preset-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-space-3);
}

.perm-preset-row__label {
  font-size: var(--dw-text-sm);
  font-weight: 600;
  color: var(--dw-text-secondary);
}

.perm-preset-segment {
  flex-wrap: wrap;
  height: auto;
  min-height: var(--dw-btn-height-sm);
}

.perm-matrix {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-4);
  padding: var(--dw-space-6) var(--dw-space-7);
  min-height: 0;
  flex: 1;
  overflow: auto;
}

.perm-matrix__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap-md);
}

.perm-matrix__search {
  flex: 1 1 12rem;
  min-width: 0;
}

.perm-matrix__hint,
.perm-matrix__empty {
  margin: 0;
}

.perm-groups {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-3);
}

.perm-group {
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-surface);
  overflow: hidden;
}

.perm-group__head {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: var(--dw-gap);
  width: 100%;
  padding: var(--dw-pad-control-lg);
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.perm-group__head:hover {
  background: var(--dw-bg-hover);
}

.perm-group__chevron {
  color: var(--dw-text-secondary);
  transition: transform var(--dw-duration) var(--dw-ease);
}

.perm-group.is-expanded .perm-group__chevron {
  transform: rotate(180deg);
}

.perm-group__title {
  font-size: var(--dw-text-md);
  font-weight: 600;
}

.perm-group__actions {
  display: inline-flex;
  gap: var(--dw-space-2);
}

.perm-group__body {
  padding: 0 var(--dw-space-5) var(--dw-space-5);
  border-top: 1px solid var(--dw-border-light);
}

.perm-check-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  gap: var(--dw-space-2) var(--dw-space-4);
  padding-top: var(--dw-space-4);
}

.perm-check {
  font-size: var(--dw-text-sm);
}

.perm-editor__empty {
  flex: 1;
}

.perm-save-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap-md);
  margin-top: var(--mp-gap-lg);
  padding: var(--dw-space-4) var(--dw-space-6);
  position: sticky;
  bottom: 0;
  z-index: var(--dw-z-raised);
}

.perm-save-bar__hint {
  flex: 1 1 15rem;
  margin: 0;
  min-width: 0;
}

@media (max-width: 900px) {
  .perm-workbench.dw-split-pane {
    min-height: auto;
  }

  :deep(.perm-sidebar) {
    position: static;
    max-height: 17.5rem;
  }

  .perm-check-grid {
    grid-template-columns: 1fr;
  }

  .perm-group__head {
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
  }

  .perm-group__actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
}
</style>

