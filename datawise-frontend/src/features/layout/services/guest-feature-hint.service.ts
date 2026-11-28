import {i18n} from '@/i18n'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useToastStore} from '@/features/layout/stores/toast-store'

/**
 * 游客模式的功能受限提示：用「登录后可解锁 + 一键登录」代替生硬的错误 Toast。
 * 启动阶段往往会有多条同类 403 并发，这里做时间窗去重，避免刷屏。
 */

/** 任意两条引导提示之间的最小间隔 */
export const GUEST_HINT_MIN_INTERVAL_MS = 8_000
/** 同一条文案的重复抑制窗口 */
export const GUEST_HINT_SAME_INTERVAL_MS = 30_000

let lastShownAt = 0
let lastMessageKey = ''

/** 纯函数节流判定（状态由调用方注入，便于回归测试覆盖）。 */
export function shouldThrottleGuestHint(
    messageKey: string,
    now: number,
    previousShownAt: number,
    previousKey: string,
): boolean {
    if (now - previousShownAt < GUEST_HINT_MIN_INTERVAL_MS) return true
    return (
        messageKey === previousKey
        && now - previousShownAt < GUEST_HINT_SAME_INTERVAL_MS
    )
}

export function showGuestFeatureHint(messageKey: string, now = Date.now()): boolean {
    if (shouldThrottleGuestHint(messageKey, now, lastShownAt, lastMessageKey)) return false
    lastShownAt = now
    lastMessageKey = messageKey

    const toast = useToastStore()
    toast.show(String(i18n.global.t(messageKey)), {
        variant: 'info',
        durationMs: 6_000,
        action: {
            label: String(i18n.global.t('auth.guestHintLoginAction')),
            onClick: () => useAuthStore().openLoginDialog(),
        },
    })
    return true
}

/** @internal test helper */
export function resetGuestFeatureHintState(): void {
    lastShownAt = 0
    lastMessageKey = ''
}
