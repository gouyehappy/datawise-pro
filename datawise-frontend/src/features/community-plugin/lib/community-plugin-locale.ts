import type {CommunityPluginInfo} from '@/shared/api/http/community-plugins'

/**
 * Resolve display strings from the plugin package (manifest / contribution /
 * field declarations). The host does not ship per-pluginId catalog overrides —
 * third-party plugins must work with only their .dwp contents.
 */

/** hostApi 1.3 manifest `localizations` entry (DBX-compatible shape). */
export type CommunityPluginLocalization = {
  name?: string
  description?: string
  contributions?: Record<string, {
    label?: string
    description?: string
    actions?: Record<string, {label?: string; description?: string}>
    fields?: Record<string, {
      label?: string
      description?: string
      placeholder?: string
      /** value → label map or a {value,label} list. */
      options?: Record<string, string> | Array<{label?: string; value: string}>
    }>
  }>
}

/**
 * Pick the manifest localization for the UI locale with a graceful fallback:
 * exact tag (`zh-CN`) → language part (`zh`) → null (English manifest base).
 */
export function resolveCommunityPluginLocalization(
    manifest: CommunityPluginInfo['manifest'],
    locale: string,
): CommunityPluginLocalization | null {
  const localizations = manifest.localizations as
    | Record<string, CommunityPluginLocalization>
    | undefined
  if (!localizations || typeof localizations !== 'object') return null
  const tag = (locale || '').trim()
  if (localizations[tag]) return localizations[tag]
  const language = tag.split('-')[0]
  if (language && localizations[language]) return localizations[language]
  for (const key of Object.keys(localizations)) {
    if (key.split('-')[0] === language) return localizations[key]
  }
  return null
}

/** Contribution-scoped overrides for label / description / action / field copy. */
export function scopedCommunityPluginLocalization(
    localization: CommunityPluginLocalization | null,
    contributionId?: string,
): NonNullable<CommunityPluginLocalization['contributions']>[string] {
  if (!localization?.contributions || !contributionId) return {}
  return localization.contributions[contributionId] ?? {}
}

function localizedOptionLabel(
    options: NonNullable<NonNullable<NonNullable<CommunityPluginLocalization['contributions']>[string]['fields']>[string]['options']>,
    value: string,
): string | undefined {
  if (Array.isArray(options)) {
    return options.find((option) => option.value === value)?.label
  }
  return options[value]
}

export function communityPluginDisplayName(
    plugin: CommunityPluginInfo,
    localization?: CommunityPluginLocalization | null,
): string {
  return localization?.name || plugin.manifest.name || plugin.manifest.id
}

/** English (or manifest-base) title. List rows keep this as the primary line. */
export function communityPluginBaseName(plugin: CommunityPluginInfo): string {
  return (plugin.manifest.name || plugin.manifest.id || '').trim()
}

/**
 * Localized name when it differs from the base title.
 * Used as the list subtitle under the English name.
 */
export function communityPluginAlternateName(
    plugin: CommunityPluginInfo,
    localization?: CommunityPluginLocalization | null,
): string {
  const localized = (localization?.name || '').trim()
  const base = communityPluginBaseName(plugin)
  if (!localized || localized === base) return ''
  return localized
}

export function communityPluginDisplayDescription(
    plugin: CommunityPluginInfo,
    localization?: CommunityPluginLocalization | null,
): string {
  return (localization?.description || plugin.manifest.description || '').trim()
}

export function communityPluginContributionLabel(
    contribution: {id?: string; label?: string},
    scoped?: {label?: string; description?: string},
): string {
  return scoped?.label || contribution.label || contribution.id || ''
}

export function communityPluginContributionDescription(
    contribution: {id?: string; description?: string},
    scoped?: {label?: string; description?: string},
): string {
  return (scoped?.description || contribution.description || '').trim()
}

export function communityPluginFieldLabel(
    field: {key: string; label?: string},
    scopedField?: {label?: string; description?: string; placeholder?: string},
): string {
  return scopedField?.label || field.label || field.key
}

export function communityPluginFieldDescription(
    field: {key: string; description?: string},
    scopedField?: {label?: string; description?: string; placeholder?: string},
): string {
  return (scopedField?.description || field.description || '').trim()
}

export function communityPluginFieldPlaceholder(
    field: {key: string; placeholder?: string},
    scopedField?: {label?: string; description?: string; placeholder?: string},
): string {
  return scopedField?.placeholder || field.placeholder || ''
}

export function communityPluginFieldOptionLabel(
    option: {label?: string; value: string},
    scopedField?: {options?: Record<string, string> | Array<{label?: string; value: string}>},
): string {
  if (scopedField?.options) {
    const localized = localizedOptionLabel(scopedField.options, option.value)
    if (localized) return localized
  }
  return option.label || option.value
}
