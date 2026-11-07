import {useAppPalette} from '@/features/layout/composables/useAppPalette'

export function useGlobalObjectSearch() {
    const {paletteOpen, openPalette, closePalette, togglePalette} = useAppPalette()

    return {
        globalObjectSearchOpen: paletteOpen,
        openGlobalObjectSearch: openPalette,
        closeGlobalObjectSearch: closePalette,
        toggleGlobalObjectSearch: togglePalette,
    }
}
