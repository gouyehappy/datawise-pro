import type {InjectionKey} from 'vue'

export const sessionKillKey: InjectionKey<SessionKillContext> = Symbol('sessionKill')

export interface PendingSessionKill {
    sessionId: string
    mode: import('@/features/workspace/services/session-kill.service').SessionKillMode
    onSuccess?: () => void | Promise<void>
}

export interface SessionKillContext {
    canKill: import('vue').ComputedRef<boolean>
    killingSessionId: import('vue').Ref<string | null>
    confirmOpen: import('vue').Ref<boolean>
    pendingKill: import('vue').Ref<PendingSessionKill | null>
    requestKill: (
        sessionId: string,
        mode: import('@/features/workspace/services/session-kill.service').SessionKillMode,
        onSuccess?: () => void | Promise<void>,
    ) => void
    confirmKill: () => Promise<boolean>
    cancelKill: () => void
}
