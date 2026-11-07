import {authApi, type AuthUser} from '@/api'
import {persistSession} from '@/shared/auth/session'
import type {LoginResult, SessionInfo} from '@/shared/api/types'

export function persistAuthSession(
    session: Pick<SessionInfo, 'sessionId' | 'userName' | 'guest' | 'expiresAtEpochMs' | 'userId'>,
): void {
    persistSession(
        session.sessionId,
        session.userName,
        session.guest,
        session.expiresAtEpochMs,
        session.userId,
    )
}

export function persistLoginResult(result: LoginResult, userName: string, isGuest: boolean): void {
    persistSession(
        result.sessionId,
        result.userName ?? userName,
        isGuest,
        result.expiresAtEpochMs ?? null,
        result.userId,
    )
}

export function sessionInfoToUser(session: SessionInfo): Pick<AuthUser, 'userName' | 'userId' | 'isGuest'> {
    return {userName: session.userName, userId: session.userId, isGuest: session.guest}
}

export async function refreshSessionToken(): Promise<SessionInfo | null> {
    try {
        return await authApi.getCurrentSession({silent: true})
    } catch {
        return null
    }
}
