/** 是否为选中补全项导致的替换（区别于逐字输入） */
export function isCompletionAcceptChange(change: {
    rangeLength: number
    text: string
}): boolean {
    if (change.text.length >= 2) return true
    if (change.rangeLength > 0 && change.text.length >= 1) return true
    return false
}
