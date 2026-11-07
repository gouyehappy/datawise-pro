import {ref} from 'vue'
import type {DashboardPreferences} from '@/features/dashboard/services/dashboard-widget.service'
import {
    moveWidget,
    type DashboardWidgetColumn,
    type DashboardWidgetId,
} from '@/features/dashboard/services/dashboard-widget.service'

export interface DashboardWidgetDragState {
    widgetId: DashboardWidgetId
    column: DashboardWidgetColumn
    index: number
}

export function useDashboardWidgetDrag(onPersist: (prefs: DashboardPreferences) => void) {
    const layoutEditMode = ref(false)
    const dragState = ref<DashboardWidgetDragState | null>(null)
    const dropTarget = ref<{column: DashboardWidgetColumn; index: number} | null>(null)

    function toggleLayoutEditMode() {
        layoutEditMode.value = !layoutEditMode.value
        if (!layoutEditMode.value) {
            dragState.value = null
            dropTarget.value = null
        }
    }

    function isDragging(column: DashboardWidgetColumn, index: number): boolean {
        if (!dragState.value) return false
        return dragState.value.column === column && dragState.value.index === index
    }

    function isDropTarget(column: DashboardWidgetColumn, index: number): boolean {
        if (!dropTarget.value) return false
        return dropTarget.value.column === column && dropTarget.value.index === index
    }

    function onWidgetDragStart(
        widgetId: DashboardWidgetId,
        column: DashboardWidgetColumn,
        index: number,
        event: DragEvent,
    ) {
        dragState.value = {widgetId, column, index}
        event.dataTransfer?.setData('text/plain', widgetId)
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move'
        }
    }

    function onWidgetDragOver(column: DashboardWidgetColumn, index: number) {
        dropTarget.value = {column, index}
    }

    function onWidgetDrop(
        column: DashboardWidgetColumn,
        index: number,
        prefs: DashboardPreferences,
    ) {
        if (!dragState.value) return
        const next = moveWidget(prefs, dragState.value.widgetId, column, index)
        onPersist(next)
        dragState.value = null
        dropTarget.value = null
    }

    function onWidgetDragEnd() {
        dragState.value = null
        dropTarget.value = null
    }

    function onColumnDrop(
        column: DashboardWidgetColumn,
        count: number,
        prefs: DashboardPreferences,
    ) {
        onWidgetDrop(column, Math.max(0, count - 1), prefs)
    }

    return {
        layoutEditMode,
        toggleLayoutEditMode,
        isDragging,
        isDropTarget,
        onWidgetDragStart,
        onWidgetDragOver,
        onWidgetDrop,
        onWidgetDragEnd,
        onColumnDrop,
    }
}
