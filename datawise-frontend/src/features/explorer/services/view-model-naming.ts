const MODEL_TAB_PATTERN = /^model_(\d{2})$/i
const MODEL_FILE_PATTERN = /^model_(\d{2})\.view\.sql$/i

/** Tab / 文件展示名 → 视图模型 stem（去掉 .view.sql） */
export function stripViewModelDisplayName(raw: string): string {
    const trimmed = raw.trim()
    if (/\.view\.sql$/i.test(trimmed)) {
        return trimmed.replace(/\.view\.sql$/i, '').trim()
    }
    return trimmed.replace(/\.sql$/i, '').trim()
}

/** 与 SQL 脚本/表名类似的命名规则：非空、首字符为字母或中文、不能仅为符号 */
export function isValidViewModelBaseName(raw: string): boolean {
    const trimmed = stripViewModelDisplayName(raw)
    if (!trimmed) return false
    if (/^[-_.]+$/.test(trimmed)) return false
    if (!/^[a-zA-Z\u4e00-\u9fff]/.test(trimmed)) return false
    return /[\w\u4e00-\u9fff]/.test(trimmed)
}

export type RenameViewModelPlan =
    | {ok: false; reason: 'noop' | 'invalid-name'}
    | {ok: true; name: string}

/** Pure rename validation for explorer view-model confirm dialog. */
export function resolveRenameViewModelPlan(
    nextTitle: string,
    currentLabel: string,
): RenameViewModelPlan {
    const trimmed = stripViewModelDisplayName(nextTitle)
    if (!trimmed || trimmed === currentLabel) return {ok: false, reason: 'noop'}
    if (!isValidViewModelBaseName(trimmed)) return {ok: false, reason: 'invalid-name'}
    return {ok: true, name: trimmed}
}

export function nextViewModelTabName(names: string[]): string {
    const numbers = names
        .map((name) => {
            const trimmed = name.trim()
            const tabMatch = MODEL_TAB_PATTERN.exec(trimmed)
            if (tabMatch) return Number.parseInt(tabMatch[1], 10)
            const fileMatch = MODEL_FILE_PATTERN.exec(trimmed)
            if (fileMatch) return Number.parseInt(fileMatch[1], 10)
            return Number.NaN
        })
        .filter((value) => Number.isFinite(value))

    const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1
    return `model_${String(next).padStart(2, '0')}`
}
