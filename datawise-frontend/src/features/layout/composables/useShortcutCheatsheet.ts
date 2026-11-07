import {ref} from 'vue'

const open = ref(false)

export function useShortcutCheatsheet() {
    function show() {
        open.value = true
    }

    function hide() {
        open.value = false
    }

    function toggle() {
        open.value = !open.value
    }

    return {
        open,
        show,
        hide,
        toggle,
    }
}
