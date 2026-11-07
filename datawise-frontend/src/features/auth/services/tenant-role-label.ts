/** 后端 bootstrap 写入的英文显示名；未改名时前端改走 i18n。 */
const SYSTEM_ROLE_BOOTSTRAP_NAMES: Record<string, readonly string[]> = {
    tenant_admin: ['Tenant Admin'],
    developer: ['Developer'],
    analyst: ['Analyst'],
    readonly: ['Read Only', 'Readonly', 'Read only'],
}

/**
 * 租户角色展示名：系统角色若仍是 bootstrap 英文名则用 locale；自定义名/自定义角色保留原值。
 */
export function localizeTenantRoleName(
    key: string,
    storedName: string | undefined | null,
    translate: (key: string) => string,
): string {
    const i18nKey = `settings.userPermissions.roles.${key}`
    const localized = translate(i18nKey)
    const hasI18n = localized !== i18nKey
    const name = storedName?.trim() ?? ''
    const bootstraps = SYSTEM_ROLE_BOOTSTRAP_NAMES[key]
    const isBootstrap =
        !name
        || Boolean(bootstraps?.some((entry) => entry.toLowerCase() === name.toLowerCase()))
    if (hasI18n && isBootstrap) {
        return localized
    }
    if (name) return name
    return hasI18n ? localized : key
}
