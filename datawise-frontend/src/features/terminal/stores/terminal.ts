import {defineStore} from 'pinia'
import {ref} from 'vue'
import {t} from '@/i18n'
import {terminalApi} from '@/api'

export type TerminalLineType = 'in' | 'out' | 'err' | 'sys'

export interface TerminalLine {
    type: TerminalLineType
    text: string
}

function platformLabel() {
    if (typeof window !== 'undefined' && window.datawise?.platform) {
        return window.datawise.platform
    }
    return 'web'
}

export const useTerminalStore = defineStore('terminal', () => {
    const cwd = ref('~/datawise')
    const lines = ref<TerminalLine[]>([])
    const commandHistory = ref<string[]>([])
    let historyCursor = -1
    let booted = false

    async function ensureBoot() {
        if (booted) return
        booted = true
        const text = await terminalApi.welcome(platformLabel())
        lines.value = [{type: 'sys', text}]
    }

    function promptPrefix() {
        return `${cwd.value} $`
    }

    async function run(input: string) {
        await ensureBoot()
        const trimmed = input.trim()
        lines.value.push({type: 'in', text: `${promptPrefix()} ${input}`})

        if (!trimmed) return

        if (trimmed !== commandHistory.value[0]) {
            commandHistory.value.unshift(trimmed)
            if (commandHistory.value.length > 50) commandHistory.value.pop()
        }
        historyCursor = -1

        const result = await terminalApi.execute(trimmed, {
            cwd: cwd.value,
            platform: platformLabel(),
        })

        if (result.cwd) cwd.value = result.cwd

        for (const line of result.lines) {
            if (line.text === '__CLEAR__') {
                lines.value = [{type: 'sys', text: await terminalApi.welcome(platformLabel())}]
                return
            }
            lines.value.push({type: line.type, text: line.text})
        }
    }

    function historyUp(): string | null {
        if (!commandHistory.value.length) return null
        historyCursor = Math.min(historyCursor + 1, commandHistory.value.length - 1)
        return commandHistory.value[historyCursor] ?? null
    }

    function historyDown(): string | null {
        if (historyCursor <= 0) {
            historyCursor = -1
            return ''
        }
        historyCursor -= 1
        return commandHistory.value[historyCursor] ?? ''
    }

    function clear() {
        lines.value = [{type: 'sys', text: t('terminal.cleared')}]
    }

    return {
        cwd,
        lines,
        commandHistory,
        ensureBoot,
        promptPrefix,
        run,
        historyUp,
        historyDown,
        clear,
    }
})
