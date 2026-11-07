export type JreSource = 'bundled' | 'system' | 'custom'

export interface JrePreferences {
    source: JreSource
    customHome?: string | null
}
