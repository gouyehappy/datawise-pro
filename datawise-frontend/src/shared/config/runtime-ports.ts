import ports from '../../../runtime-ports.json' with {type: 'json'}

/** 开发 / 手动启动的后端（mvn、Vite 代理）— runtime-ports.json → dev.backend */
export const BACKEND_DEV_PORT = ports.dev.backend
/** 桌面安装包内嵌后端 — runtime-ports.json → desktop.backend */
export const BACKEND_PACKAGED_PORT = ports.desktop.backend

/** @deprecated 使用 BACKEND_DEV_PORT */
export const BACKEND_PORT = BACKEND_DEV_PORT

export const FRONTEND_DEV_PORT = ports.dev.frontend
export const FRONTEND_E2E_PORT = ports.frontendE2e
export const CDS_TRAIN_PORT = ports.cdsTrain

export function backendDevBaseUrl(host: '127.0.0.1' | 'localhost' = '127.0.0.1'): string {
    return `http://${host}:${BACKEND_DEV_PORT}`
}

export function backendPackagedBaseUrl(host: '127.0.0.1' | 'localhost' = '127.0.0.1'): string {
    return `http://${host}:${BACKEND_PACKAGED_PORT}`
}

/** @deprecated 使用 backendDevBaseUrl */
export function backendBaseUrl(host: '127.0.0.1' | 'localhost' = '127.0.0.1'): string {
    return backendDevBaseUrl(host)
}

export function frontendDevOrigin(host: '127.0.0.1' | 'localhost' = '127.0.0.1'): string {
    return `http://${host}:${FRONTEND_DEV_PORT}`
}
