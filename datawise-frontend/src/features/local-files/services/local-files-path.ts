/** Extensions opened as editable text in the local files workspace. */
export const LOCAL_TEXT_EXTENSIONS = new Set([
    '.sql',
    '.ddl',
    '.txt',
    '.md',
    '.markdown',
    '.json',
    '.yaml',
    '.yml',
    '.xml',
    '.csv',
    '.log',
    '.properties',
    '.conf',
    '.ini',
    '.toml',
    '.env',
    '.sh',
    '.bash',
    '.ps1',
    '.js',
    '.ts',
    '.tsx',
    '.jsx',
    '.vue',
    '.css',
    '.scss',
    '.less',
    '.html',
    '.htm',
    '.java',
    '.kt',
    '.kts',
    '.py',
    '.go',
    '.rs',
    '.c',
    '.h',
    '.cpp',
    '.hpp',
    '.cs',
    '.php',
    '.rb',
    '.swift',
    '.scala',
    '.groovy',
    '.gradle',
    '.r',
    '.lua',
    '.pl',
    '.pm',
    '.bat',
    '.cmd',
    '.dockerfile',
    '.gitignore',
    '.gitattributes',
    '.editorconfig',
    '.svg',
])

/** Extensions that should not open in the text editor (tree still lists them). */
export const LOCAL_BINARY_EXTENSIONS = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.ico',
    '.bmp',
    '.tif',
    '.tiff',
    '.pdf',
    '.zip',
    '.jar',
    '.war',
    '.ear',
    '.gz',
    '.tgz',
    '.7z',
    '.rar',
    '.tar',
    '.bz2',
    '.xz',
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.class',
    '.o',
    '.a',
    '.lib',
    '.obj',
    '.woff',
    '.woff2',
    '.ttf',
    '.otf',
    '.eot',
    '.mp3',
    '.mp4',
    '.wav',
    '.flac',
    '.aac',
    '.avi',
    '.mov',
    '.mkv',
    '.webm',
    '.db',
    '.sqlite',
    '.sqlite3',
    '.parquet',
    '.bin',
    '.dat',
    '.wasm',
    '.pyc',
    '.pyo',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
])

export function fileExtension(pathOrName: string): string {
    const base = pathOrName.replace(/\\/g, '/')
    const name = base.includes('/') ? base.slice(base.lastIndexOf('/') + 1) : base
    // Dotfiles like `.env` / `.gitignore` — treat whole name as the extension key.
    if (name.startsWith('.') && !name.slice(1).includes('.')) {
        return name.toLowerCase()
    }
    const dot = name.lastIndexOf('.')
    if (dot <= 0) return ''
    return name.slice(dot).toLowerCase()
}

export {renameSelectionRange} from '@/core/ui/inline-rename'

export function isLocalTextFileName(pathOrName: string): boolean {
    return LOCAL_TEXT_EXTENSIONS.has(fileExtension(pathOrName))
}

export function isLocalBinaryFileName(pathOrName: string): boolean {
    return LOCAL_BINARY_EXTENSIONS.has(fileExtension(pathOrName))
}

/** Any non-binary file can open in the lightweight text editor. */
export function canOpenLocalFileInEditor(pathOrName: string): boolean {
    return !isLocalBinaryFileName(pathOrName)
}

export function isLocalSqlFileName(pathOrName: string): boolean {
    const ext = fileExtension(pathOrName)
    return ext === '.sql' || ext === '.ddl'
}

/** Absolute path on desktop (Win drive / UNC / POSIX). */
export function isLocalAbsolutePath(path: string | null | undefined): boolean {
    const value = path?.trim()
    if (!value) return false
    if (/^[a-zA-Z]:[\\/]/.test(value)) return true
    if (value.startsWith('\\\\') || value.startsWith('//')) return true
    if (value.startsWith('/')) return true
    return false
}

export function localFileBaseName(path: string): string {
    const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
    const parts = normalized.split('/')
    return parts[parts.length - 1] || normalized || path
}

export function localFileParentPath(path: string): string | null {
    const normalized = path.replace(/\\/g, '/')
    const idx = normalized.lastIndexOf('/')
    if (idx <= 0) {
        // Windows root like C:/
        if (/^[a-zA-Z]:$/i.test(normalized.replace(/\/$/, ''))) return null
        return null
    }
    const parent = path.slice(0, path.length - (normalized.length - idx))
    return parent || null
}

export function joinLocalPath(parent: string, name: string): string {
    const sep = parent.includes('\\') && !parent.includes('/') ? '\\' : '/'
    const trimmedParent = parent.replace(/[/\\]+$/, '')
    return `${trimmedParent}${sep}${name}`
}

export function localFileNodeId(absolutePath: string): string {
    return `local-file:${normalizeLocalPathKey(absolutePath)}`
}

export function normalizeLocalPathKey(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function pathFromLocalFileNodeId(nodeId: string): string | null {
    if (!nodeId.startsWith('local-file:')) return null
    return nodeId.slice('local-file:'.length)
}
