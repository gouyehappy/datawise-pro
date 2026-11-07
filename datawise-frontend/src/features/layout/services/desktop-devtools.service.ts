import {readDatawiseHost} from '@/features/layout/services/desktop-bridge'

export function canToggleDesktopDevTools(): boolean {
    return Boolean(readDatawiseHost()?.devtools?.toggle)
}

export async function toggleDesktopDevTools(): Promise<boolean> {
    const host = readDatawiseHost()
    if (!host?.devtools?.toggle) {
        return false
    }
    await host.devtools.toggle()
    return true
}
