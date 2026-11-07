import {ref, watch, type Ref} from 'vue'
import {
    clearGridViewState,
    createEmptyGridViewState,
    type GridViewState,
} from '@/features/workspace/data-grid/services/grid-view-state.service'
import {persistGridViewState, readGridViewState} from '@/features/workspace/data-grid/services/grid-view-state.persistence'

export function useGridViewState(scope: Ref<string | null | undefined>) {
    const viewState = ref<GridViewState>(createEmptyGridViewState())
    let persistTimer: ReturnType<typeof setTimeout> | null = null
    let loadedScope: string | null = null

    function loadForScope(nextScope: string | null | undefined) {
        loadedScope = nextScope?.trim() || null
        viewState.value = loadedScope ? readGridViewState(loadedScope) : createEmptyGridViewState()
    }

    function schedulePersist() {
        if (!loadedScope) return
        if (persistTimer) clearTimeout(persistTimer)
        persistTimer = setTimeout(() => {
            if (!loadedScope) return
            persistGridViewState(loadedScope, viewState.value)
        }, 280)
    }

    watch(
        scope,
        (nextScope) => {
            loadForScope(nextScope)
        },
        {immediate: true},
    )

    watch(
        viewState,
        () => {
            schedulePersist()
        },
        {deep: true},
    )

    function resetViewState() {
        viewState.value = clearGridViewState(viewState.value)
    }

    return {
        viewState,
        resetViewState,
    }
}
