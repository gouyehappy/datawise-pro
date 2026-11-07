const PARAM_PATTERN = /\{\{(\w+)\}\}/g

export function extractCommandParams(command: string): string[] {
    const seen = new Set<string>()
    const params: string[] = []
    for (const match of command.matchAll(PARAM_PATTERN)) {
        const name = match[1]
        if (!name || seen.has(name)) continue
        seen.add(name)
        params.push(name)
    }
    return params
}

export function commandNeedsParams(command: string): boolean {
    return extractCommandParams(command).length > 0
}

export function resolveCommandTemplate(
    command: string,
    values: Record<string, string>,
): string {
    return command.replace(PARAM_PATTERN, (_full, name: string) => values[name]?.trim() ?? '')
}

export function missingCommandParams(
    command: string,
    values: Record<string, string>,
): string[] {
    return extractCommandParams(command).filter((name) => !values[name]?.trim())
}
