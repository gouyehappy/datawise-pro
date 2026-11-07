import {useLayoutStore} from '@/features/layout/stores/layout'

/**
 * 统一 Toast 入口：经 layout facade 转发，勿旁路直连 toast-store。
 * 就地校验/表单错误请用 DwInlineAlert，勿与 StatusBar 双发。
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
    }
}
