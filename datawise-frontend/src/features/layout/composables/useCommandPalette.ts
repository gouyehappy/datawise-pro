import {useAppPalette} from '@/features/layout/composables/useAppPalette'

export function useCommandPalette() {
    const {paletteOpen, openPalette, closePalette, togglePalette} = useAppPalette()

    return {
        commandPaletteOpen: paletteOpen,
        openCommandPalette: openPalette,
        closeCommandPalette: closePalette,
        toggleCommandPalette: togglePalette,
    }
}
