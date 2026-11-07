/** 桌面打包渲染进程（非 Vite 开发服） */
export function isPackagedRenderer(): boolean {
    if (typeof window === 'undefined') return false
    const protocol = window.location.protocol
    return protocol === 'file:' || protocol === 'app:'
}
