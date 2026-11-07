import {defineStore} from 'pinia'
import {computed, ref} from 'vue'
import {SHORTCUT_DEFINITIONS} from '@/core/shortcuts/definitions'
import {formatBinding, parseBinding} from '@/core/shortcuts/shortcut.service'
import type {ShortcutActionId, ShortcutCategory, ShortcutPreferences} from '@/core/shortcuts/types'

function buildDefaults(): ShortcutPreferences {
    const prefs: ShortcutPreferences = {}
    for (const def of SHORTCUT_DEFINITIONS) {
        prefs[def.id] = def.defaultBinding
    }
    return prefs
}

export const useShortcutSettingsStore = defineStore('shortcut-settings', () => {
    const bindings = ref<ShortcutPreferences>(buildDefaults())

    function applyPreferences(prefs?: ShortcutPreferences) {
        const next = buildDefaults()
        if (prefs) {
            for (const def of SHORTCUT_DEFINITIONS) {
                const value = prefs[def.id]
                if (typeof value === 'string') {
                    const trimmed = value.trim()
                    // Migrate legacy AI prompt bindings that collide with SSH or Monaco.
                    if (
                        def.id === 'workspace.aiPrompt'
                        && (trimmed === '/' || trimmed === 'Ctrl+/')
                    ) {
                        next[def.id] = def.defaultBinding
                        continue
                    }
                    next[def.id] = trimmed || def.defaultBinding
                }
            }
        }
        bindings.value = next
    }

    function getBinding(id: ShortcutActionId): string {
        const trimmed = bindings.value[id]?.trim()
        if (trimmed) return trimmed
        return SHORTCUT_DEFINITIONS.find((def) => def.id === id)?.defaultBinding ?? ''
    }

    function getDisplayBinding(id: ShortcutActionId): string {
        const binding = getBinding(id)
        return binding ? formatBinding(binding) : ''
    }

    function setBinding(id: ShortcutActionId, binding: string) {
        bindings.value = {...bindings.value, [id]: binding.trim()}
    }

    function resetBinding(id: ShortcutActionId) {
        const def = SHORTCUT_DEFINITIONS.find((item) => item.id === id)
        if (!def) return
        setBinding(id, def.defaultBinding)
    }

    function resetAll() {
        bindings.value = buildDefaults()
    }

    function snapshot(): ShortcutPreferences {
        return {...bindings.value}
    }

    function findConflict(id: ShortcutActionId, binding: string): ShortcutActionId | null {
        const trimmed = binding.trim()
        if (!trimmed) return null
        const parsed = parseBinding(trimmed)
        if (!parsed) return null

        for (const def of SHORTCUT_DEFINITIONS) {
            if (def.id === id) continue
            const other = getBinding(def.id).trim()
            if (!other) continue
            const otherParsed = parseBinding(other)
            if (
                otherParsed
                && otherParsed.ctrl === parsed.ctrl
                && otherParsed.alt === parsed.alt
                && otherParsed.shift === parsed.shift
                && otherParsed.key === parsed.key
            ) {
                return def.id
            }
        }
        return null
    }

    const groupedDefinitions = computed(() => {
        const groups: Record<ShortcutCategory, typeof SHORTCUT_DEFINITIONS> = {
            explorer: [],
            workspace: [],
            app: [],
        }
        for (const def of SHORTCUT_DEFINITIONS) {
            groups[def.category].push(def)
        }
        return groups
    })

    return {
        bindings,
        groupedDefinitions,
        applyPreferences,
        getBinding,
        getDisplayBinding,
        setBinding,
        resetBinding,
        resetAll,
        snapshot,
        findConflict,
    }
})
