export interface KafkaTopicPrefixGroup {
    prefix: string
    label: string
    pattern: string
    topics: string[]
}

const NO_PREFIX = '__no_prefix__'
const TOPIC_DELIMITERS = ['-', '.', '_', ':'] as const

/** 取 Topic 第一段前缀（按 - . _ : 中最早出现的分隔符）。 */
export function detectTopicPrefix(topic: string): string {
    let firstIndex = -1
    for (const delimiter of TOPIC_DELIMITERS) {
        const index = topic.indexOf(delimiter)
        if (index > 0 && (firstIndex === -1 || index < firstIndex)) {
            firstIndex = index
        }
    }
    if (firstIndex <= 0) {
        return NO_PREFIX
    }
    return topic.slice(0, firstIndex + 1)
}

export function groupKafkaTopicsByPrefix(topics: string[]): KafkaTopicPrefixGroup[] {
    const buckets = new Map<string, string[]>()
    for (const topic of topics) {
        const prefix = detectTopicPrefix(topic)
        const list = buckets.get(prefix) ?? []
        list.push(topic)
        buckets.set(prefix, list)
    }

    return [...buckets.entries()]
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
        .map(([prefix, groupedTopics]) => ({
            prefix,
            label: prefix === NO_PREFIX ? '(other)' : prefix,
            pattern: prefix === NO_PREFIX ? '*' : `${prefix}*`,
            topics: groupedTopics.sort((a, b) => a.localeCompare(b)),
        }))
}

export function deriveTopicPrefixPatterns(topics: string[], limit = 8): string[] {
    return groupKafkaTopicsByPrefix(topics)
        .filter((group) => group.prefix !== NO_PREFIX)
        .slice(0, limit)
        .map((group) => group.pattern)
}

export function filterKafkaTopics(topics: string[], query: string): string[] {
    const needle = query.trim().toLowerCase()
    if (!needle) return topics
    return topics.filter((topic) => topic.toLowerCase().includes(needle))
}

export function normalizeKafkaTopicPattern(pattern: string): string {
    const trimmed = pattern.trim()
    if (!trimmed) return '*'
    if (/[*?[\]]/.test(trimmed)) return trimmed
    return `${trimmed}*`
}

export const KAFKA_TOPICS_PAGE_SIZE = 500
