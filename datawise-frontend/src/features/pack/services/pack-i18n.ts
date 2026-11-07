import type {PackId} from '@/features/pack/types/pack.types'

/**
 * vue-i18n resolves message paths on `.`, but Pack / Suite ids contain dots
 * (`pack.ai`, `suite.pro`). Store and look up those segments with `/` instead.
 */
export function packLocaleSegment(id: string): string {
    return id.split('.').join('/')
}

export function packNameKey(packId: PackId | string): string {
    return `pack.packs.${packLocaleSegment(packId)}.name`
}

export function packPitchKey(packId: PackId | string): string {
    return `pack.packs.${packLocaleSegment(packId)}.pitch`
}

export function packHighlightKey(packId: PackId | string): string {
    return `pack.packs.${packLocaleSegment(packId)}.highlight`
}

export function suiteNameKey(suiteId: string): string {
    return `pack.suite.${packLocaleSegment(suiteId)}.name`
}

export function suiteTaglineKey(suiteId: string): string {
    return `pack.suite.${packLocaleSegment(suiteId)}.tagline`
}

export function packPaywallContextKey(context: string): string {
    return `pack.paywall.context.${packLocaleSegment(context)}`
}

export function packCapabilityKey(capability: string): string {
    return `pack.capabilities.${packLocaleSegment(capability)}`
}
