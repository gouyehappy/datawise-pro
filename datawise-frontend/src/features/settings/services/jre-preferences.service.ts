import type {JrePreferences, JreSource} from '@/features/settings/services/jre-preferences.types'

export type {JrePreferences, JreSource}

export async function loadJrePreferences(): Promise<JrePreferences> {
    if (window.datawise?.config?.getJrePreferences) {
        return window.datawise.config.getJrePreferences()
    }
    if (window.datawise?.config?.getSettings) {
        const settings = await window.datawise.config.getSettings()
        if (settings.jre) return settings.jre
    }
    return {source: 'bundled', customHome: null}
}

export async function saveJrePreferences(prefs: Partial<JrePreferences>): Promise<JrePreferences> {
    if (!window.datawise?.config?.setJrePreferences) {
        throw new Error('JRE preferences are only available in the desktop app')
    }
    return window.datawise.config.setJrePreferences(prefs)
}

export async function browseJreHome(): Promise<string | null> {
    if (window.datawise?.config?.pickDirectory) {
        return window.datawise.config.pickDirectory()
    }
    if (window.datawise?.fs?.selectDirectory) {
        return window.datawise.fs.selectDirectory()
    }
    return null
}
