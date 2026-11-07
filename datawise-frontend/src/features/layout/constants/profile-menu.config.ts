import type {DwIconName} from '@/core/icons'
import {
    FeaturePermission,
    type FeaturePermissionKey,
} from '@/features/auth/types/feature-permission.types'

export type ProfileMenuActionId =
    | 'settings'
    | 'profile'
    | 'onboarding'
    | 'runtime-setup'
    | 'reload-explorer'
    | 'team'
    | 'guest-login'
    | 'lock-screen'
    | 'sign-out'

export interface ProfileMenuItemDef {
    id: string
    action: ProfileMenuActionId
    icon: DwIconName
    permission?: FeaturePermissionKey
    accent?: boolean
    badgeKey?: string
    profileLabelKey?: string
    titleBarLabelKey?: string
}

/** 头像菜单与顶栏应用菜单共用的账户/工具项（label 可按场景覆盖）。 */
export const SHARED_PROFILE_MENU_ITEMS: ProfileMenuItemDef[] = [
    {
        id: 'settings',
        action: 'settings',
        permission: FeaturePermission.ProfileSettings,
        icon: 'settings-basic',
        profileLabelKey: 'profile.menu.settings',
        titleBarLabelKey: 'app.titleBar.mainMenu.settings',
    },
    {
        id: 'profile',
        action: 'profile',
        permission: FeaturePermission.SettingsProfile,
        icon: 'user',
        profileLabelKey: 'profile.menu.profile',
        titleBarLabelKey: 'app.titleBar.mainMenu.profile',
    },
    {
        id: 'onboarding',
        action: 'onboarding',
        permission: FeaturePermission.ProfileOnboarding,
        icon: 'tour',
        profileLabelKey: 'profile.menu.onboarding',
        titleBarLabelKey: 'app.titleBar.mainMenu.onboarding',
    },
    {
        id: 'runtime-setup',
        action: 'runtime-setup',
        permission: FeaturePermission.ProfileOnboarding,
        icon: 'connectors',
        profileLabelKey: 'profile.menu.runtimeSetup',
        titleBarLabelKey: 'app.titleBar.mainMenu.runtimeSetup',
    },
    {
        id: 'reload-explorer',
        action: 'reload-explorer',
        permission: FeaturePermission.UtilRefresh,
        icon: 'refresh',
        titleBarLabelKey: 'app.titleBar.mainMenu.reloadExplorer',
    },
]

export const PROFILE_TEAM_MENU_ITEM: ProfileMenuItemDef = {
    id: 'team',
    action: 'team',
    permission: FeaturePermission.ProfileTeam,
    icon: 'users',
    accent: true,
    badgeKey: 'profile.menu.new',
    profileLabelKey: 'profile.menu.createOrJoinTeam',
    titleBarLabelKey: 'profile.menu.createOrJoinTeam',
}

export const PROFILE_GUEST_LOGIN_ITEM: ProfileMenuItemDef = {
    id: 'guest-login',
    action: 'guest-login',
    icon: 'user',
    accent: true,
    titleBarLabelKey: 'auth.accountLogin',
}

export const PROFILE_LOCK_SCREEN_ITEM: ProfileMenuItemDef = {
    id: 'lock-screen',
    action: 'lock-screen',
    icon: 'lock',
    profileLabelKey: 'lockScreen.menuLock',
    titleBarLabelKey: 'lockScreen.menuLock',
}

export const PROFILE_SIGN_OUT_ITEM: ProfileMenuItemDef = {
    id: 'sign-out',
    action: 'sign-out',
    icon: 'log-out',
    profileLabelKey: 'auth.signOutAccount',
    titleBarLabelKey: 'auth.signOutAccount',
}

export function resolveProfileMenuLabelKey(
    item: ProfileMenuItemDef,
    surface: 'profile' | 'titleBar',
): string {
    const key = surface === 'profile'
        ? (item.profileLabelKey ?? item.titleBarLabelKey)
        : (item.titleBarLabelKey ?? item.profileLabelKey)
    if (!key) {
        throw new Error(`Missing label for menu item ${item.id} on ${surface}`)
    }
    return key
}
