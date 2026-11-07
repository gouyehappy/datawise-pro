import {SearchAddon, type ISearchOptions} from '@xterm/addon-search'
import {SerializeAddon} from '@xterm/addon-serialize'
import {Unicode11Addon} from '@xterm/addon-unicode11'
import {WebglAddon} from '@xterm/addon-webgl'
import type {Terminal} from '@xterm/xterm'

export interface SshTerminalAddonHandles {
    search: SearchAddon
    serialize: SerializeAddon
    dispose: () => void
}

const SEARCH_DECORATIONS: NonNullable<ISearchOptions['decorations']> = {
    matchBackground: '#264f78',
    matchBorder: '#60a5fa',
    matchOverviewRuler: '#3b82f6',
    activeMatchBackground: '#b45309',
    activeMatchBorder: '#fbbf24',
    activeMatchColorOverviewRuler: '#f59e0b',
}

/**
 * Attach optional xterm addons after {@link Terminal.open}.
 * Soft-fail every addon so a single GPU/unicode failure cannot block SSH connect.
 */
export function attachSshTerminalAddons(terminal: Terminal): SshTerminalAddonHandles {
    try {
        const unicode11 = new Unicode11Addon()
        terminal.loadAddon(unicode11)
        terminal.unicode.activeVersion = '11'
    } catch {
        // unicode11 is optional
    }

    const search = new SearchAddon()
    try {
        terminal.loadAddon(search)
    } catch {
        // search optional
    }

    const serialize = new SerializeAddon()
    try {
        terminal.loadAddon(serialize)
    } catch {
        // serialize optional
    }

    let webgl: WebglAddon | null = null
    try {
        const addon = new WebglAddon()
        addon.onContextLoss(() => {
            // Disposing WebGL without a canvas fallback leaves a blank terminal
            // (connected badge, no cursor) after GPU context loss from long idle tabs.
            try {
                addon.dispose()
            } catch {
                // ignore
            }
            webgl = null
            try {
                terminal.refresh(0, terminal.rows - 1)
            } catch {
                // canvas renderer resumes after WebGL dispose
            }
        })
        terminal.loadAddon(addon)
        webgl = addon
    } catch {
        webgl = null
    }

    return {
        search,
        serialize,
        dispose() {
            try {
                webgl?.dispose()
            } catch {
                // ignore
            }
            webgl = null
            try {
                search.dispose()
            } catch {
                // ignore
            }
            try {
                serialize.dispose()
            } catch {
                // ignore
            }
        },
    }
}

export function findWithSearchAddon(
    search: SearchAddon | null,
    query: string,
    direction: 'next' | 'prev',
): boolean {
    if (!search) return false
    const term = query.trim()
    if (!term) return false
    const options: ISearchOptions = {
        caseSensitive: false,
        decorations: SEARCH_DECORATIONS,
    }
    return direction === 'next'
        ? search.findNext(term, options)
        : search.findPrevious(term, options)
}

export function clearSearchAddon(search: SearchAddon | null) {
    search?.clearDecorations()
}

/** Prefer serialize strip-down via buffer lines; serialize() keeps ANSI for restore. */
export function exportTerminalPlainText(
    terminal: Terminal | null,
    serialize: SerializeAddon | null,
    maxLines = 5000,
): string {
    if (!terminal) return ''
    // Plain text from the active buffer is more useful for .log / clipboard than ANSI dumps.
    const buffer = terminal.buffer.active
    const start = Math.max(0, buffer.length - maxLines)
    const lines: string[] = []
    for (let row = start; row < buffer.length; row += 1) {
        lines.push(buffer.getLine(row)?.translateToString(true) ?? '')
    }
    const plain = lines.join('\n').trimEnd()
    if (plain) return plain
    // Fallback when buffer APIs are empty but serialize still has content.
    if (!serialize) return ''
    try {
        return serialize.serialize({scrollback: maxLines}).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').trimEnd()
    } catch {
        return ''
    }
}
