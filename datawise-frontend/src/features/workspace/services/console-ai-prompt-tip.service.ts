import {persistDesktopUiKeys} from '@/features/layout/services/desktop-ui-store'

/** A3-2: one-shot tip after first successful SQL run — Alt+/ for AI */
export const CONSOLE_AI_PROMPT_TIP_SEEN_KEY = 'dw-cli-console-ai-prompt-tip-seen'

export function isConsoleAiPromptTipSeen(storage: Storage = localStorage): boolean {
    return storage.getItem(CONSOLE_AI_PROMPT_TIP_SEEN_KEY) === '1'
}

export function markConsoleAiPromptTipSeen(storage: Storage = localStorage): void {
    storage.setItem(CONSOLE_AI_PROMPT_TIP_SEEN_KEY, '1')
    persistDesktopUiKeys({consoleAiPromptTipSeen: '1'})
}

/**
 * Show StatusBar tip once after a successful run. Returns true if tip was shown.
 * Prefer StatusBar over toast (console chrome channel).
 */
export function maybeNotifyConsoleAiPromptTip(
    setStatus: (message: string) => void,
    message: string,
    storage: Storage = localStorage,
): boolean {
    if (isConsoleAiPromptTipSeen(storage)) return false
    markConsoleAiPromptTipSeen(storage)
    setStatus(message)
    return true
}
