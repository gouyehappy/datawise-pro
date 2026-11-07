import {htmlToPlainText} from '@/features/ssh/services/ssh-html-text.service'

/** Detect legacy rich-text / pre-wrapped HTML records. */
export function looksLikeStoredHtml(value: string): boolean {
    const trimmed = value?.trim() ?? ''
    if (!trimmed) return false
    return /^<[a-z!/?]/i.test(trimmed) || /<\/(?:p|div|pre|span|br|li|h[1-6]|ul|ol)\s*>/i.test(trimmed)
}

/** Normalize any stored payload (plain or legacy HTML) to editable command text. */
export function toPlainCommandText(stored: string): string {
    if (!stored) return ''
    if (looksLikeStoredHtml(stored)) {
        return htmlToPlainText(stored)
    }
    return stored.replace(/\r\n/g, '\n')
}

/** Persist command text as plain text (no HTML wrapper). */
export function toStoredCommandText(text: string): string {
    return (text ?? '').replace(/\r\n/g, '\n')
}

/** @deprecated Use {@link toPlainCommandText} */
export function recordHtmlToCommandText(html: string): string {
    return toPlainCommandText(html)
}

/** @deprecated Use {@link toStoredCommandText} — kept for call-site compatibility. */
export function commandTextToRecordHtml(text: string): string {
    return toStoredCommandText(text)
}

export const SSH_COMMAND_TEMPLATE = `@paste
# 切换 root :: 获取管理员权限，再执行后续操作
sudo -s

@run
# 查看业务 Pod :: 列出全部命名空间的 Pod，并筛选名称含 busi 的项
kubectl get pods -A -o wide | grep busi
`
