import type {AiCanvasParameter} from '@/features/platform/types/platform.types'

const PARAM_PATTERN = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g

/** 从模板文本中提取 `{{key}}` 占位符，生成画布参数定义。 */
export function extractCanvasParameters(...templates: Array<string | null | undefined>): AiCanvasParameter[] {
    const keys = new Set<string>()
    for (const template of templates) {
        if (!template) continue
        for (const match of template.matchAll(PARAM_PATTERN)) {
            const key = match[1]?.trim()
            if (key) keys.add(key)
        }
    }
    return [...keys].map((key) => ({
        key,
        label: key,
        defaultValue: '',
        type: 'string',
    }))
}

/** 将参数默认值合并为 rerun 请求用的 map。 */
export function buildParameterValueMap(
    parameters: AiCanvasParameter[] | null | undefined,
    overrides: Record<string, string> = {},
): Record<string, string> {
    const values: Record<string, string> = {}
    for (const param of parameters ?? []) {
        if (!param.key) continue
        values[param.key] = overrides[param.key] ?? param.defaultValue ?? ''
    }
    for (const [key, value] of Object.entries(overrides)) {
        values[key] = value
    }
    return values
}
