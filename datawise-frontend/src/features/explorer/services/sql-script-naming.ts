const SCRIPT_NAME_PATTERN = /^script-(\d+)\.sql$/i

/** Strip a trailing `.sql` suffix (case-insensitive). Preserves other characters as-is. */
export function stripSqlExtension(fileName: string): string {
    return fileName.replace(/\.sql$/i, '')
}

export type RenameSqlFilePlan =
    | {ok: false; reason: 'invalid-name' | 'unchanged'}
    | {ok: true; newBaseName: string}

/**
 * Pure rename validation for explorer SQL-file confirm dialog.
 * `nextBaseName` is the stem after {@link sqlFileNameFromTabLabel} (or equivalent).
 */
export function resolveRenameSqlFilePlan(
    nextBaseName: string,
    currentFileName: string,
): RenameSqlFilePlan {
    if (!nextBaseName) return {ok: false, reason: 'invalid-name'}
    if (nextBaseName === stripSqlExtension(currentFileName)) return {ok: false, reason: 'unchanged'}
    return {ok: true, newBaseName: nextBaseName}
}

export function nextScriptFileName(files: { fileName: string }[]): string {
    const numbers = files
        .map((file) => SCRIPT_NAME_PATTERN.exec(file.fileName)?.[1])
        .filter((value): value is string => !!value)
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isFinite(value))

    const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1
    return `Script-${next}.sql`
}
