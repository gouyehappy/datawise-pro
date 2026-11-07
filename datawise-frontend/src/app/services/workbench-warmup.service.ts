/**
 * 启动完成后空闲预热高频异步页与 SQL 编辑器插件，降低首次打开时的布局占位闪现。
 * 必须走 requestIdleCallback（见 scheduleIdleWarmup）——不得在 shell-ready 前抢 CPU。
 */
import {scheduleIdleWarmup} from '@/core/registry/create-lazy-view'
import {prefetchWorkspaceTabs} from '@/features/workspace/tab-registry'
import {prefetchSettingsPanels} from '@/features/settings/settings-section-registry'
import {prefetchWorkbenchModules} from '@/features/layout/module-registry'
import {ensureSqlEditorPlugin} from '@/features/workspace/services/ensure-sql-editor-plugin'

let scheduled = false

export function scheduleWorkbenchWarmup(): void {
    if (scheduled) return
    scheduled = true
    scheduleIdleWarmup(() => {
        void prefetchWorkspaceTabs()
        void prefetchSettingsPanels()
        void prefetchWorkbenchModules()
        void ensureSqlEditorPlugin().catch((error) => {
            console.warn('[datawise] sql editor warmup failed', error)
        })
    })
}
