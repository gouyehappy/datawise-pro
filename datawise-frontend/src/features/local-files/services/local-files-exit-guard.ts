import {listDirtyLocalWorkspaceTabs} from '@/features/local-files/services/local-files-workspace-tabs'

type ExitAskFn = () => Promise<boolean>

let askExit: ExitAskFn | null = null

export function registerLocalFilesExitAsk(fn: ExitAskFn | null) {
    askExit = fn
}

/** Returns true when the app may close (no dirty local tabs, or user confirmed). */
export async function confirmLocalFilesExitIfNeeded(): Promise<boolean> {
    if (!listDirtyLocalWorkspaceTabs().length) return true
    if (!askExit) return true
    return askExit()
}
