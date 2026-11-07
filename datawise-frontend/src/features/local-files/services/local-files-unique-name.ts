import {listLocalDirectory} from '@/features/local-files/services/local-files.service'
import {fileExtension, localFileBaseName} from '@/features/local-files/services/local-files-path'

function splitFileName(name: string): {stem: string; ext: string} {
    const ext = fileExtension(name)
    if (!ext) return {stem: name, ext: ''}
    return {stem: name.slice(0, -ext.length), ext}
}

/**
 * Pick a sibling name that does not collide (case-insensitive).
 * `foo.txt` → `foo (1).txt` → `foo (2).txt` …
 */
export async function allocateUniqueChildName(
    parentPath: string,
    desiredName: string,
    options?: {isDirectory?: boolean; ignoreName?: string | null},
): Promise<string> {
    const desired = desiredName.trim()
    if (!desired) return desired

    const entries = await listLocalDirectory(parentPath, true)
    const ignoreKey = options?.ignoreName?.trim().toLowerCase() || null
    const used = new Set(
        entries
            .map((item) => item.name.trim().toLowerCase())
            .filter((name) => name && name !== ignoreKey),
    )

    if (!used.has(desired.toLowerCase())) return desired

    const isDirectory = Boolean(options?.isDirectory)
    const {stem, ext} = isDirectory ? {stem: desired, ext: ''} : splitFileName(desired)
    const safeStem = stem || localFileBaseName(desired) || 'item'

    for (let index = 1; index <= 999; index += 1) {
        const candidate = ext ? `${safeStem} (${index})${ext}` : `${safeStem} (${index})`
        if (!used.has(candidate.toLowerCase())) return candidate
    }
    throw new Error('name_exhausted')
}
