import type {ComposerTranslation} from 'vue-i18n'
import type {BackendStartupPhase} from '@/features/layout/services/desktop-backend-startup.service'
import {readDesktopBridge} from '@/features/layout/services/desktop-bridge'

function isPackagedDesktop(): boolean {
    const bridge = readDesktopBridge()
    return bridge?.isPackaged ?? bridge?.splash?.getMeta?.()?.isPackaged ?? false
}

/** 桌面 / Web 启动阶段文案（单一来源） */
export function resolveStartupPhaseLabel(
    t: ComposerTranslation,
    phase: BackendStartupPhase,
): string {
    const packaged = isPackagedDesktop()

    switch (phase) {
        case 'config':
            return t('app.startup.config')
        case 'spawning':
            return packaged ? t('app.startup.spawning') : t('app.startup.spawningDev')
        case 'warming':
            return packaged ? t('app.startup.warming') : t('app.startup.warmingDev')
        case 'session':
            return t('app.startup.session')
        case 'sync':
            return t('app.startup.sync')
        case 'ready':
            return t('app.startup.finalize')
        case 'failed':
            return t('app.startup.failed')
        default:
            return t('app.startup.idle')
    }
}
