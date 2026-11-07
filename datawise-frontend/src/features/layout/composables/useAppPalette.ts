import {ref} from 'vue'

const paletteOpen = ref(false)

/** Unified command / object search palette open state (Ctrl+K and Ctrl+Shift+O). */
export function useAppPalette() {
    function openPalette() {
        paletteOpen.value = true
    }

    function closePalette() {
        paletteOpen.value = false
    }

    function togglePalette() {
        paletteOpen.value = !paletteOpen.value
    }

    return {
        paletteOpen,
        openPalette,
        closePalette,
        togglePalette,
    }
}
