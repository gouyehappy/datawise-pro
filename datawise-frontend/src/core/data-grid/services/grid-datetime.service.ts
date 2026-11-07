export type GridTemporalKind = 'datetime' | 'date' | 'time'

export type GridDateTimeParts = {
    year: number
    month: number // 1-12
    day: number
    hour: number
    minute: number
    second: number
    millis: number
}

const DATETIME_RE =
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?/
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?/

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

function pad2(value: number): string {
    return String(value).padStart(2, '0')
}

function pad3(value: number): string {
    return String(value).padStart(3, '0')
}

function daysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate()
}

export function createGridDateTimeParts(from: Date = new Date()): GridDateTimeParts {
    return {
        year: from.getFullYear(),
        month: from.getMonth() + 1,
        day: from.getDate(),
        hour: from.getHours(),
        minute: from.getMinutes(),
        second: from.getSeconds(),
        millis: from.getMilliseconds(),
    }
}

export function normalizeGridDateTimeParts(parts: GridDateTimeParts): GridDateTimeParts {
    const year = clamp(Math.trunc(parts.year) || new Date().getFullYear(), 1, 9999)
    const month = clamp(Math.trunc(parts.month) || 1, 1, 12)
    const maxDay = daysInMonth(year, month)
    return {
        year,
        month,
        day: clamp(Math.trunc(parts.day) || 1, 1, maxDay),
        hour: clamp(Math.trunc(parts.hour) || 0, 0, 23),
        minute: clamp(Math.trunc(parts.minute) || 0, 0, 59),
        second: clamp(Math.trunc(parts.second) || 0, 0, 59),
        millis: clamp(Math.trunc(parts.millis) || 0, 0, 999),
    }
}

/** 解析单元格文本；失败则回退到当前时间 */
export function parseGridDateTimeText(
    raw: string,
    kind: GridTemporalKind,
): GridDateTimeParts {
    const text = raw.trim()
    const now = createGridDateTimeParts()
    if (!text) return now

    if (kind === 'time') {
        const match = text.match(TIME_RE)
        if (!match) return now
        return normalizeGridDateTimeParts({
            ...now,
            hour: Number(match[1]),
            minute: Number(match[2]),
            second: Number(match[3] ?? 0),
            millis: Number((match[4] ?? '0').slice(0, 3).padEnd(3, '0')),
        })
    }

    const match = text.match(DATETIME_RE)
    if (!match) {
        const asDate = new Date(text)
        if (!Number.isNaN(asDate.getTime())) return createGridDateTimeParts(asDate)
        return now
    }

    return normalizeGridDateTimeParts({
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        hour: Number(match[4] ?? (kind === 'date' ? 0 : now.hour)),
        minute: Number(match[5] ?? (kind === 'date' ? 0 : now.minute)),
        second: Number(match[6] ?? (kind === 'date' ? 0 : now.second)),
        millis: Number((match[7] ?? '0').slice(0, 3).padEnd(3, '0')),
    })
}

export function formatGridDateTimeParts(
    parts: GridDateTimeParts,
    kind: GridTemporalKind,
    options?: {withMillis?: boolean},
): string {
    const normalized = normalizeGridDateTimeParts(parts)
    const date = `${normalized.year}-${pad2(normalized.month)}-${pad2(normalized.day)}`
    const timeCore = `${pad2(normalized.hour)}:${pad2(normalized.minute)}:${pad2(normalized.second)}`
    const time = options?.withMillis ? `${timeCore}.${pad3(normalized.millis)}` : timeCore

    if (kind === 'date') return date
    if (kind === 'time') return time
    return `${date} ${time}`
}

export type GridCalendarCell = {
    day: number
    month: number
    year: number
    inCurrentMonth: boolean
}

/** 生成月历 6x7 格子（周日起始） */
export function buildGridCalendarCells(year: number, month: number): GridCalendarCell[] {
    const first = new Date(year, month - 1, 1)
    const startWeekday = first.getDay() // 0=Sun
    const days = daysInMonth(year, month)
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const prevDays = daysInMonth(prevYear, prevMonth)
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year

    const cells: GridCalendarCell[] = []
    for (let i = 0; i < startWeekday; i += 1) {
        const day = prevDays - startWeekday + i + 1
        cells.push({day, month: prevMonth, year: prevYear, inCurrentMonth: false})
    }
    for (let day = 1; day <= days; day += 1) {
        cells.push({day, month, year, inCurrentMonth: true})
    }
    let nextDay = 1
    while (cells.length < 42) {
        cells.push({day: nextDay, month: nextMonth, year: nextYear, inCurrentMonth: false})
        nextDay += 1
    }
    return cells
}

export function shiftGridCalendarMonth(year: number, month: number, delta: number): {year: number; month: number} {
    const index = year * 12 + (month - 1) + delta
    return {
        year: Math.floor(index / 12),
        month: (index % 12) + 1,
    }
}
