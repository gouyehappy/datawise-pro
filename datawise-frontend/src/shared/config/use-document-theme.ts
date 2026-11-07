import {onMounted, onUnmounted, ref, computed, type ComputedRef} from 'vue'

/** Reactive dark-mode flag from `document.documentElement[data-theme]` (set by theme service). */
export function useDocumentThemeIsDark(): ComputedRef<boolean> {
    const mode = ref(readDocumentTheme())

    let observer: MutationObserver | null = null

    onMounted(() => {
        mode.value = readDocumentTheme()
        observer = new MutationObserver(() => {
            mode.value = readDocumentTheme()
        })
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        })
    })

    onUnmounted(() => {
        observer?.disconnect()
        observer = null
    })

    return computed(() => mode.value === 'dark')
}

function readDocumentTheme(): string {
    if (typeof document === 'undefined') return 'light'
    return document.documentElement.getAttribute('data-theme') ?? 'light'
}
