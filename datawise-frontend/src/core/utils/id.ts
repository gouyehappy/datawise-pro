/** 生成带前缀的唯一 id（Tab、日志等） */
export function createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}
