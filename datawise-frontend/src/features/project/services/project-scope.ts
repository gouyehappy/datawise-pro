/** Explorer / API：是否显示全部项目的连接（对应后端 scope=all）。 */
const LS_SCOPE_ALL = 'dw-cli-project-scope-all'

export function isProjectScopeAll(): boolean {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(LS_SCOPE_ALL) === '1'
}

export function setProjectScopeAll(enabled: boolean): void {
    if (typeof localStorage === 'undefined') return
    if (enabled) localStorage.setItem(LS_SCOPE_ALL, '1')
    else localStorage.removeItem(LS_SCOPE_ALL)
}

export function toggleProjectScopeAll(): boolean {
    const next = !isProjectScopeAll()
    setProjectScopeAll(next)
    return next
}
