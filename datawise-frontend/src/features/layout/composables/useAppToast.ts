import {useLayoutStore} from '@/features/layout/stores/layout'
import type {AppNotificationPushInput} from '@/features/layout/services/app-feedback.service'

/**
 * 统一反馈入口：经 layout facade 转发，勿旁路直连 toast-store。
 * 就地校验/表单错误请用 DwInlineAlert，勿与 StatusBar 双发。
 *
 * 成功优先：silent（UI 已自证）→ notifyQuiet（可回溯）→ toast（必须立刻看见）。
 */
export function useAppToast() {
    const layout = useLayoutStore()

    return {
        show: (
            message: string,
            options?: {
                variant?: 'info' | 'success' | 'warning' | 'error'
                durationMs?: number
                action?: {label: string; onClick: () => void}
            },
        ) => layout.showToast(message, options),
        success: (message: string) => layout.showSuccessToast(message),
        warning: (message: string) => layout.showWarningToast(message),
        error: (message: string) => layout.showErrorToast(message),
        /** 重要但可稍后看：只进通知抽屉，不弹 toast。 */
        notify: (input: AppNotificationPushInput) => layout.notifyQuiet(input),
    }
}
