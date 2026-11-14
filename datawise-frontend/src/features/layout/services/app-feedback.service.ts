import type {NotificationCategory} from '@/core/types'
import {useNotificationStore} from '@/features/layout/stores/notification-store'

/**
 * 反馈通道策略（与 `.cursor/rules/toast-usage.mdc` 一致）：
 *
 * - silent：UI 已自证（切项目顶栏变、粘贴板、编辑器内容已变）→ 不弹
 * - toast：短时、跨上下文、需要立即看见的失败/风险/少见成功
 * - notification：可稍后看的重要结果（导出、迁移、版本、长任务）→ 只进通知抽屉
 */

export type AppNotificationPushInput = {
    category: NotificationCategory
    titleKey: string
    bodyKey: string
    params?: Record<string, string | number>
}

/** 写入通知抽屉，不弹 toast。失败时吞掉，避免反馈通道本身打断主流程。 */
export async function pushAppNotification(input: AppNotificationPushInput): Promise<void> {
    try {
        await useNotificationStore().push(input)
    } catch {
        // ignore
    }
}

/** 导出类完成：进通知，不弹 toast。 */
export async function notifyExportDone(name: string): Promise<void> {
    await pushAppNotification({
        category: 'export',
        titleKey: 'exportDone',
        bodyKey: 'exportDone',
        params: {name},
    })
}

/** 迁移等长任务完成：进通知，不弹 toast。 */
export async function notifyMigrationDone(summary: string): Promise<void> {
    await pushAppNotification({
        category: 'workspace',
        titleKey: 'migrationDone',
        bodyKey: 'migrationDone',
        params: {summary},
    })
}
