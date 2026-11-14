import {computed, type ComputedRef} from 'vue'
import type {DwIconName} from '@/core/icons'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useFeaturePermission} from '@/features/auth/composables/useFeaturePermission'
import {
    PROFILE_GUEST_LOGIN_ITEM,
    PROFILE_LOCK_SCREEN_ITEM,
    PROFILE_SIGN_OUT_ITEM,
    PROFILE_TEAM_MENU_ITEM,
    resolveProfileMenuLabelKey,
    SHARED_PROFILE_MENU_ITEMS,
    type ProfileMenuActionId,
    type ProfileMenuItemDef,
} from '@/features/layout/constants/profile-menu.config'
import {useProfileMenuActions} from '@/features/layout/composables/useProfileMenuActions'

export interface ResolvedProfileMenuItem {
    id: string
    labelKey: string
    icon: DwIconName
    accent?: boolean
    badgeKey?: string
    onClick: () => void
}

function resolveActionHandler(
    action: ProfileMenuActionId,
    handlers: ReturnType<typeof useProfileMenuActions>,
    extra?: {onReloadExplorer?: () => void},
): () => void {
    switch (action) {
        case 'settings':
            return handlers.openSettings
        case 'profile':
            return handlers.openProfile
        case 'onboarding':
            return handlers.openOnboardingGuide
        case 'runtime-setup':
            return handlers.openRuntimeSetup
        case 'team':
            return handlers.openTeam
        case 'guest-login':
            return handlers.openAccountLogin
        case 'lock-screen':
            return handlers.lockScreen
        case 'sign-out':
            return handlers.signOut
        case 'reload-explorer':
            return extra?.onReloadExplorer ?? (() => {})
    }
}

function mapMenuItem(
    item: ProfileMenuItemDef,
    surface: 'profile' | 'titleBar',
    handlers: ReturnType<typeof useProfileMenuActions>,
    extra?: {onReloadExplorer?: () => void},
): ResolvedProfileMenuItem {
    return {
        id: item.id,
        labelKey: resolveProfileMenuLabelKey(item, surface),
        icon: item.icon,
        accent: item.accent,
        badgeKey: item.badgeKey,
        onClick: resolveActionHandler(item.action, handlers, extra),
    }
}

function isItemVisible(
    item: ProfileMenuItemDef,
    can: (key: import('@/features/auth/types/feature-permission.types').FeaturePermissionKey) => boolean,
): boolean {
    return item.permission ? can(item.permission) : true
}

export function useProfileSidebarMenuGroups(onClose: () => void): ComputedRef<ResolvedProfileMenuItem[][]> {
    const auth = useAuthStore()
    const {can} = useFeaturePermission()
    const handlers = useProfileMenuActions(onClose)

    return computed(() => {
        const groups: ResolvedProfileMenuItem[][] = []

        if (auth.isGuest) {
            groups.push([mapMenuItem(PROFILE_GUEST_LOGIN_ITEM, 'profile', handlers)])
        }

        const accountItems = SHARED_PROFILE_MENU_ITEMS
            .filter((item) => item.profileLabelKey && isItemVisible(item, can))
            .map((item) => mapMenuItem(item, 'profile', handlers))
        if (accountItems.length > 0) {
            groups.push(accountItems)
        }

        if (isItemVisible(PROFILE_TEAM_MENU_ITEM, can)) {
            groups.push([mapMenuItem(PROFILE_TEAM_MENU_ITEM, 'profile', handlers)])
        }

        if (!auth.isGuest) {
            if (auth.canLockScreen) {
                groups.push([mapMenuItem(PROFILE_LOCK_SCREEN_ITEM, 'profile', handlers)])
            }
            groups.push([mapMenuItem(PROFILE_SIGN_OUT_ITEM, 'profile', handlers)])
        }

        return groups
    })
}

export function useTitleBarPreferenceMenuItems(
    onClose: () => void,
    onReloadExplorer: () => void,
    options?: {tier?: 'primary' | 'secondary' | 'all'},
): ComputedRef<ResolvedProfileMenuItem[]> {
    const {can} = useFeaturePermission()
    const handlers = useProfileMenuActions(onClose)
    const tier = options?.tier ?? 'all'

    return computed(() =>
        SHARED_PROFILE_MENU_ITEMS
            .filter((item) => item.titleBarLabelKey && isItemVisible(item, can))
            .filter((item) => {
                if (tier === 'all') return true
                return (item.mainMenuTier ?? 'secondary') === tier
            })
            .map((item) => mapMenuItem(item, 'titleBar', handlers, {onReloadExplorer})),
    )
}

export function useTitleBarAuthMenuItems(onClose: () => void): ComputedRef<ResolvedProfileMenuItem[]> {
    const auth = useAuthStore()
    const {can} = useFeaturePermission()
    const handlers = useProfileMenuActions(onClose)

    return computed(() => {
        const items: ResolvedProfileMenuItem[] = []
        if (auth.isGuest) {
            items.push(mapMenuItem(PROFILE_GUEST_LOGIN_ITEM, 'titleBar', handlers))
        }
        if (isItemVisible(PROFILE_TEAM_MENU_ITEM, can)) {
            items.push(mapMenuItem(PROFILE_TEAM_MENU_ITEM, 'titleBar', handlers))
        }
        if (auth.canLockScreen) {
            items.push(mapMenuItem(PROFILE_LOCK_SCREEN_ITEM, 'titleBar', handlers))
        }
        if (!auth.isGuest) {
            items.push(mapMenuItem(PROFILE_SIGN_OUT_ITEM, 'titleBar', handlers))
        }
        return items
    })
}
