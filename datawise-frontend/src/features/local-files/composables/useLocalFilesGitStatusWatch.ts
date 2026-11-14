import {onMounted, onUnmounted} from 'vue'
import {useLocalFilesStore} from '@/features/local-files/stores/local-files-store'
import {bindForegroundSettleRefresh} from '@/shared/browser/foreground-settle'

/**
 * 窗口回到前台后再轻量刷新 git 状态。
 * 调度走全局 foreground-settle，不与 Alt+Tab 首帧合成抢同一拍。
 */
export function useLocalFilesGitStatusWatch() {
    const localFiles = useLocalFilesStore()
    let unbind: (() => void) | null = null

    onMounted(() => {
        unbind = bindForegroundSettleRefresh(
            () => {
                if (!localFiles.rootPath) return
                localFiles.scheduleGitStatusRefresh()
            },
            // 略晚于布局稳态，给虚拟树首帧留空
            {afterMs: 120},
        )
    })

    onUnmounted(() => {
        unbind?.()
        unbind = null
    })
}
