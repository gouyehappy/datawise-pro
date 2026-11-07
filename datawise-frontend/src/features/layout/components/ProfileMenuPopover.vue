<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {useProfileSidebarMenuGroups} from '@/features/layout/composables/useProfileMenuGroups'
import {resolveDisplayApiErrorMessage} from '@/shared/api/http/api-error-message'

const emit = defineEmits<{ close: [] }>()

const props = defineProps<{
  menuStyle?: {top: string; left: string}
}>()

const {t} = useI18n()
const layout = useLayoutStore()
const auth = useAuthStore()
const menuGroups = useProfileSidebarMenuGroups(() => emit('close'))

async function onSwitchTenant(nextId: string) {
  if (nextId === auth.tenantId) return
  emit('close')
  try {
    await auth.switchTenant(nextId)
  } catch (error) {
    useAppToast().error(resolveDisplayApiErrorMessage(error, (key) => String(t(key))))
  }
}
</script>

<template>
  <div
      class="profile-menu"
      :class="{ 'profile-menu--anchored': !!props.menuStyle }"
      :style="props.menuStyle"
      @click.stop
  >
    <header class="menu-head">
      <div class="menu-avatar" :class="{ 'menu-avatar--guest': auth.isGuest }">
        <span>{{ layout.profileName.charAt(0) }}</span>
      </div>
      <div class="menu-user">
        <div class="menu-name-row">
          <div class="menu-name">{{ layout.profileName }}</div>
          <span v-if="auth.isGuest" class="menu-guest-badge">{{ t('auth.guestBadge') }}</span>
        </div>
        <div class="menu-email">{{ layout.profileEmail }}</div>
        <div v-if="auth.tenantName && !auth.isGuest" class="menu-tenant">
          {{ t('auth.tenantCurrent') }} · {{ auth.tenantName }}
        </div>
      </div>
    </header>

    <div v-if="auth.canSwitchTenant" class="tenant-switch">
      <div class="tenant-switch-label">{{ t('auth.tenantSwitch') }}</div>
      <button
          v-for="item in auth.tenants"
          :key="item.id"
          type="button"
          class="tenant-option"
          :class="{'tenant-option--active': item.id === auth.tenantId}"
          @click="onSwitchTenant(item.id)"
      >
        <span class="tenant-option-name">{{ item.name }}</span>
        <span v-if="item.id === auth.tenantId" class="tenant-option-check">✓</span>
      </button>
    </div>

    <nav class="menu-list">
      <template v-for="(group, groupIndex) in menuGroups" :key="group[0]?.id ?? groupIndex">
        <div v-if="groupIndex > 0" class="menu-divider"/>
        <button
            v-for="item in group"
            :key="item.id"
            class="menu-item"
            :class="{'menu-item--accent': item.accent}"
            type="button"
            :data-testid="item.id === 'team' ? 'profile-menu-team' : undefined"
            @click="item.onClick"
        >
          <DwIcon :name="item.icon" size="menu" :stroke-width="item.icon === 'users' ? 1.35 : 1.4"/>
          <span class="menu-item-label">{{ t(item.labelKey) }}</span>
          <span v-if="item.badgeKey" class="menu-badge">{{ t(item.badgeKey) }}</span>
        </button>
      </template>
    </nav>
  </div>
</template>

<style scoped>
.profile-menu {
  position: fixed;
  left: calc(var(--dw-rail-width) + 8px);
  top: 10px;
  z-index: var(--dw-z-toast);
  width: 268px;
  padding: var(--dw-space-3);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg);
  box-shadow: var(--dw-shadow-float);
}

.profile-menu--anchored {
  left: auto;
  top: auto;
}

.menu-head {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-md);
  padding: var(--dw-space-5) var(--dw-space-5) var(--dw-space-4);
}

.menu-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--dw-density-lg);
  height: var(--dw-density-lg);
  border-radius: var(--dw-control-radius);
  background: var(--dw-primary);
  color: var(--dw-on-accent);
  font-size: var(--dw-text-2xl);
  font-weight: 700;
  flex-shrink: 0;
}

.menu-avatar--guest {
  background: var(--dw-text-muted);
}

.menu-user {
  min-width: 0;
}

.menu-name-row {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  min-width: 0;
}

.menu-name {
  font-size: var(--dw-text-xl);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-guest-badge {
  flex-shrink: 0;
  padding: 1px var(--dw-space-3);
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-text-muted) 12%, transparent);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  line-height: var(--dw-leading-relaxed);
}

.menu-email {
  margin-top: var(--dw-space-1);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-tenant {
  margin-top: var(--dw-space-1);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tenant-switch {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
  margin: 0 0 var(--dw-space-3);
  padding: 0 var(--dw-space-2);
}

.tenant-switch-label {
  padding: 0 var(--dw-space-3);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
}

.tenant-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap-sm);
  width: 100%;
  min-height: var(--dw-control-h);
  padding: 0 var(--dw-space-3);
  border: none;
  border-radius: var(--dw-control-radius);
  background: transparent;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  text-align: left;
  cursor: pointer;
}

.tenant-option:hover {
  background: var(--dw-bg-hover);
  color: var(--dw-text);
}

.tenant-option--active {
  background: var(--dw-primary-soft);
  color: var(--dw-primary);
  font-weight: 600;
}

.tenant-option-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tenant-option-check {
  flex-shrink: 0;
  font-size: var(--dw-text-xs);
}

.menu-list {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-md);
  width: 100%;
  min-height: var(--dw-control-h);
  padding: 0 var(--dw-space-5);
  border: none;
  border-radius: var(--dw-control-radius);
  background: transparent;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-md);
  text-align: left;
  transition: background var(--dw-duration-fast) var(--dw-ease), color var(--dw-duration-fast) var(--dw-ease);
}

.menu-item svg {
  flex-shrink: 0;
  width: var(--dw-icon-size-lg);
  height: var(--dw-icon-size-lg);
  color: var(--dw-text-muted);
}

.menu-item:hover {
  background: var(--dw-bg-hover);
  color: var(--dw-text);
}

.menu-item-label {
  flex: 1;
  min-width: 0;
}

.menu-badge {
  flex-shrink: 0;
  padding: 1px var(--dw-space-3);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-primary-soft);
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  line-height: var(--dw-leading-relaxed);
}

.menu-divider {
  height: 1px;
  margin: var(--dw-space-2) var(--dw-space-4);
  background: var(--dw-border-light);
}
</style>
