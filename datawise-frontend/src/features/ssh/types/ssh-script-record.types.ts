export type SshCommandMode = 'run' | 'paste'

/** One structured quick-command entry persisted with an SSH script record. */
export interface SshCommandItem {
    /** Display label; empty means UI shows the command summary instead. */
    title: string
    command: string
    mode: SshCommandMode
    /** Reserved for future UI; empty for now. */
    description: string
}

export interface SshScriptRecord {
    id: string
    title: string
    /**
     * Legacy field name — may still hold plain DSL text (or older HTML).
     * Prefer {@link commands} as the source of truth.
     */
    contentHtml: string
    /** Structured command entries (preferred). */
    commands?: SshCommandItem[]
    updatedAt: number
}

export function createEmptySshScriptRecord(id: string, title: string): SshScriptRecord {
    return {
        id,
        title,
        contentHtml: '',
        commands: [],
        updatedAt: Date.now(),
    }
}

export function createSshCommandItem(
    partial: Partial<SshCommandItem> & Pick<SshCommandItem, 'command'>,
): SshCommandItem {
    return {
        title: partial.title?.trim() ?? '',
        command: partial.command,
        mode: partial.mode === 'run' ? 'run' : 'paste',
        description: partial.description?.trim() ?? '',
    }
}
