import type {PluginHookName} from '@/features/plugin/types/plugin-hook.types'

export type PluginHookTemplateId = 'full' | PluginHookName

export const PLUGIN_HOOK_TEMPLATES: Record<PluginHookTemplateId, string> = {
    full: `window.datawise?.registerPluginHooks?.('my-plugin-id', {
  beforeExecute: async (ctx) => {
    // return { sql: ctx.sql } to rewrite, or { cancel: true, message: '...' } to block
    return { sql: ctx.sql }
  },
  afterResult: async (ctx) => {
    console.log('[my-plugin-id]', ctx.success, ctx.rowCount ?? ctx.errorMessage)
  },
  renderGrid: (ctx) => ({
    // rows: ctx.rows,
  }),
})`,
    beforeExecute: `window.datawise?.registerPluginHooks?.('my-plugin-id', {
  beforeExecute: async (ctx) => {
    // return { sql: ctx.sql } to rewrite, or { cancel: true, message: '...' } to block
    return { sql: ctx.sql }
  },
})`,
    afterResult: `window.datawise?.registerPluginHooks?.('my-plugin-id', {
  afterResult: async (ctx) => {
    console.log('[my-plugin-id]', ctx.success, ctx.rowCount ?? ctx.errorMessage)
  },
})`,
    renderGrid: `window.datawise?.registerPluginHooks?.('my-plugin-id', {
  renderGrid: (ctx) => ({
    // columns: ctx.columns,
    // rows: ctx.rows,
  }),
})`,
}

export function getPluginHookTemplate(id: PluginHookTemplateId): string {
    return PLUGIN_HOOK_TEMPLATES[id]
}

/** @deprecated 使用 getPluginHookTemplate('full') */
export const PLUGIN_HOOK_REGISTER_TEMPLATE = PLUGIN_HOOK_TEMPLATES.full

async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text)
            return true
        }
    } catch {
        // fall through
    }
    try {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.setAttribute('readonly', 'true')
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(textarea)
        return ok
    } catch {
        return false
    }
}

export async function copyPluginHookTemplate(id: PluginHookTemplateId = 'full'): Promise<boolean> {
    return copyText(getPluginHookTemplate(id))
}
