/** 解析逗号/换行分隔的 ID 列表（团队共享配置用） */
export function parseDelimitedIds(value: string): string[] {
    return value
        .split(/[,，;\n\r]+/)
        .map((item) => item.trim())
        .filter(Boolean)
}
