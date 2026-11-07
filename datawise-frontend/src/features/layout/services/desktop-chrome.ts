import {isNativeDesktopHost, readDatawiseHost} from '@/features/layout/services/desktop-bridge'

export function isDesktopApp(): boolean {
    return isNativeDesktopHost()
}

export function desktopPlatform(): string | null {
    if (!isNativeDesktopHost()) return null
    return readDatawiseHost()?.platform ?? null
}
