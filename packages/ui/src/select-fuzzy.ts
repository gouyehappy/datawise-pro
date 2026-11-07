/** Case-insensitive contains, then sequential-character fuzzy match for select filtering. */
export function fuzzyMatchSelectText(text: string, needle: string): boolean {
    const hay = text.toLowerCase()
    const q = needle.toLowerCase().trim()
    if (!q) return true
    if (hay.includes(q)) return true
    let qi = 0
    for (let i = 0; i < hay.length && qi < q.length; i++) {
        if (hay[i] === q[qi]) qi++
    }
    return qi === q.length
}
