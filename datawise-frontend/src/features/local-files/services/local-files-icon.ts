import type {DwIconName} from '@/core/icons'
import {fileExtension} from '@/features/local-files/services/local-files-path'

/** Visual tone for local-file tree icons (CSS class suffix). */
export type LocalFileIconTone =
    | 'folder'
    | 'sql'
    | 'markdown'
    | 'json'
    | 'data'
    | 'sheet'
    | 'log'
    | 'config'
    | 'script'
    | 'code'
    | 'text'
    | 'file'

export interface LocalFileIconSpec {
    icon: DwIconName
    tone: LocalFileIconTone
}

const EXT_ICON: Record<string, LocalFileIconSpec> = {
    '.sql': {icon: 'ddl', tone: 'sql'},
    '.ddl': {icon: 'ddl', tone: 'sql'},
    '.md': {icon: 'settings-knowledge', tone: 'markdown'},
    '.markdown': {icon: 'settings-knowledge', tone: 'markdown'},
    '.json': {icon: 'file-json', tone: 'json'},
    '.yaml': {icon: 'file-braces', tone: 'data'},
    '.yml': {icon: 'file-braces', tone: 'data'},
    '.toml': {icon: 'file-braces', tone: 'data'},
    '.xml': {icon: 'file-braces', tone: 'data'},
    '.csv': {icon: 'file-sheet', tone: 'sheet'},
    '.log': {icon: 'file-log', tone: 'log'},
    '.properties': {icon: 'settings', tone: 'config'},
    '.conf': {icon: 'settings', tone: 'config'},
    '.ini': {icon: 'settings', tone: 'config'},
    '.env': {icon: 'settings', tone: 'config'},
    '.sh': {icon: 'terminal', tone: 'script'},
    '.bash': {icon: 'terminal', tone: 'script'},
    '.ps1': {icon: 'terminal', tone: 'script'},
    '.js': {icon: 'code', tone: 'code'},
    '.ts': {icon: 'code', tone: 'code'},
    '.tsx': {icon: 'code', tone: 'code'},
    '.jsx': {icon: 'code', tone: 'code'},
    '.vue': {icon: 'code', tone: 'code'},
    '.css': {icon: 'code', tone: 'code'},
    '.scss': {icon: 'code', tone: 'code'},
    '.html': {icon: 'code', tone: 'code'},
    '.java': {icon: 'code', tone: 'code'},
    '.kt': {icon: 'code', tone: 'code'},
    '.py': {icon: 'code', tone: 'code'},
    '.go': {icon: 'code', tone: 'code'},
    '.rs': {icon: 'code', tone: 'code'},
    '.c': {icon: 'code', tone: 'code'},
    '.cpp': {icon: 'code', tone: 'code'},
    '.cs': {icon: 'code', tone: 'code'},
    '.php': {icon: 'code', tone: 'code'},
    '.rb': {icon: 'code', tone: 'code'},
    '.txt': {icon: 'editor', tone: 'text'},
    '.png': {icon: 'file', tone: 'file'},
    '.jpg': {icon: 'file', tone: 'file'},
    '.jpeg': {icon: 'file', tone: 'file'},
    '.gif': {icon: 'file', tone: 'file'},
    '.webp': {icon: 'file', tone: 'file'},
    '.pdf': {icon: 'file', tone: 'file'},
    '.zip': {icon: 'file', tone: 'file'},
    '.jar': {icon: 'file', tone: 'file'},
}

export function resolveLocalFileIcon(options: {
    name: string
    isDirectory: boolean
    expanded?: boolean
}): LocalFileIconSpec {
    if (options.isDirectory) {
        return {
            icon: options.expanded ? 'open' : 'folder',
            tone: 'folder',
        }
    }
    return EXT_ICON[fileExtension(options.name)] ?? {icon: 'file', tone: 'file'}
}
