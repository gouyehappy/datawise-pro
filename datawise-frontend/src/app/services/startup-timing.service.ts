/**
 * 启动阶段 Performance marks（`dw:startup:*`）。
 * 供 DevTools / 发版对比冷启动；不发远端、不阻塞启动。
 *
 * 查询：
 *   performance.getEntriesByType('mark')
 *     .filter((e) => e.name.startsWith('dw:startup:'))
 */

export type StartupTimingPhase =
    | 'bootstrap'
    | 'jvm-config'
    | 'jvm-spawning'
    | 'jvm-warming'
    | 'jvm-ready'
    | 'health-ready'
    | 'session-ready'
    | 'shell-ready'
    | 'first-connection'
    | 'failed'

const MARK_PREFIX = 'dw:startup:'

export function startupMarkName(phase: StartupTimingPhase): string {
    return `${MARK_PREFIX}${phase}`
}

/** 每个阶段只打一次 mark；Performance API 不可用时静默跳过。 */
export function markStartupPhase(phase: StartupTimingPhase): void {
    const name = startupMarkName(phase)
    const clock = globalThis.performance
    if (typeof clock?.mark !== 'function' || typeof clock.getEntriesByName !== 'function') {
        return
    }
    if (clock.getEntriesByName(name, 'mark').length > 0) {
        return
    }
    try {
        clock.mark(name)
    } catch {
        // ignore — marks must never break boot
    }
}

/** 已记录的 `dw:startup:*` mark 名称（按 Performance 顺序）。 */
export function listStartupMarkNames(): string[] {
    const clock = globalThis.performance
    if (typeof clock?.getEntriesByType !== 'function') {
        return []
    }
    return clock
        .getEntriesByType('mark')
        .map((entry) => entry.name)
        .filter((name) => name.startsWith(MARK_PREFIX))
}
