/** AI 插入 / 程序化写入期间抑制自动补全弹框 */
let suppressUntil = 0

export function suppressAutocomplete(ms = 320): void {
    suppressUntil = performance.now() + ms
}

export function isAutocompleteSuppressed(): boolean {
    return performance.now() < suppressUntil
}
