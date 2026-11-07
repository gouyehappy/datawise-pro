import {defineStore} from 'pinia'
import {computed, ref, shallowRef} from 'vue'
import {
    canUseLocalFilesWorkspace,
    deleteLocal,
    listLocalDirectory,
    mkdirLocal,
    pickLocalFilesRoot,
    readLocalTextFile,
    registerLocalFilesRoot,
    renameLocal,
    writeLocalTextFile,
    type LocalDirEntry,
} from '@/features/local-files/services/local-files.service'
import {
    isLocalBinaryFileName,
    joinLocalPath,
    localFileBaseName,
    localFileNodeId,
    localFileParentPath,
    normalizeLocalPathKey,
} from '@/features/local-files/services/local-files-path'
import {allocateUniqueChildName} from '@/features/local-files/services/local-files-unique-name'
import {canMoveLocalPathInto} from '@/features/local-files/services/local-files-dnd'
import type {LocalFilesExtFilter} from '@/features/local-files/services/local-files-search'
import {loadLocalTreeForSearch} from '@/features/local-files/services/local-files-search-load'
import {scanLocalFileContentHits} from '@/features/local-files/services/local-files-content-search'
import {
    fetchLocalGitStatus,
    lookupLocalGitStatus,
    type LocalGitFileStatus,
    type LocalGitStatusMap,
} from '@/features/local-files/services/local-files-git'
import {
    readLocalFilesPreferences,
    writeLocalFilesPreferences,
} from '@/features/local-files/services/local-files-prefs'

/** Cap recent workspace folders so the open menu stays short. */
export const LOCAL_FILES_MAX_RECENT = 5
/** Cap favorite folders independently of recent. */
export const LOCAL_FILES_MAX_FAVORITES = 10

export type LocalFileTreeNode = {
    id: string
    path: string
    name: string
    isDirectory: boolean
    size: number
    mtimeMs: number
    children?: LocalFileTreeNode[]
    loaded?: boolean
    expanded?: boolean
}

/** Tree-inline create / rename (no modal). */
export type LocalFilesInlineEdit = {
    mode: 'create-file' | 'create-folder' | 'rename'
    parentPath: string
    depth: number
    value: string
    targetPath?: string
    targetId?: string
    isDirectory?: boolean
}

function persistFolderHistory(
    recent: string[],
    favorites: string[],
    lastRoot: string | null,
) {
    writeLocalFilesPreferences({
        lastRoot,
        recentRoots: recent.slice(0, LOCAL_FILES_MAX_RECENT),
        favoriteRoots: favorites.slice(0, LOCAL_FILES_MAX_FAVORITES),
    })
}

function entryToNode(entry: LocalDirEntry): LocalFileTreeNode | null {
    return {
        id: localFileNodeId(entry.path),
        path: entry.path,
        name: entry.name,
        isDirectory: entry.isDirectory,
        size: entry.size,
        mtimeMs: entry.mtimeMs,
        children: entry.isDirectory ? [] : undefined,
        loaded: !entry.isDirectory,
        expanded: false,
    }
}

function makeRootNode(path: string, children: LocalFileTreeNode[]): LocalFileTreeNode {
    return {
        id: localFileNodeId(path),
        path,
        name: localFileBaseName(path),
        isDirectory: true,
        size: 0,
        mtimeMs: 0,
        children,
        loaded: true,
        expanded: true,
    }
}

export const useLocalFilesStore = defineStore('local-files', () => {
    const rootPath = ref<string | null>(null)
    const rootName = computed(() => (rootPath.value ? localFileBaseName(rootPath.value) : ''))
    const tree = shallowRef<LocalFileTreeNode[]>([])
    const expandedIds = ref<Set<string>>(new Set())
    const selectedId = ref<string | null>(null)
    const loading = ref(false)
    const flashNodeId = ref<string | null>(null)
    const initialPrefs = readLocalFilesPreferences()
    const recentRoots = ref<string[]>([...initialPrefs.recentRoots])
    const favoriteRoots = ref<string[]>([...initialPrefs.favoriteRoots])
    const lastRoot = ref<string | null>(initialPrefs.lastRoot)
    const available = computed(() => canUseLocalFilesWorkspace())
    const inlineEdit = ref<LocalFilesInlineEdit | null>(null)
    const searchQuery = ref('')
    const extFilter = ref<LocalFilesExtFilter>('all')
    const searchLoading = ref(false)
    const searchInContent = ref(false)
    const contentHitIds = ref<Set<string>>(new Set())
    const gitInsideRepo = ref(false)
    const gitStatusByKey = shallowRef<LocalGitStatusMap>(new Map())
    const selectedIds = ref<Set<string>>(new Set())
    const treeDragSourcePath = ref<string | null>(null)
    const treeDropTargetId = ref<string | null>(null)

    /** Cap recursive directory loads during search/filter so huge trees stay responsive. */
    const SEARCH_LOAD_MAX_DIRS = 400
    const SEARCH_LOAD_CONCURRENCY = 8
    const CONTENT_SCAN_MAX_FILES = 300
    const CONTENT_SCAN_CONCURRENCY = 6
    let searchLoadToken = 0
    let searchLoadTimer: ReturnType<typeof setTimeout> | null = null
    let contentScanToken = 0
    let gitRefreshToken = 0
    let gitRefreshTimer: ReturnType<typeof setTimeout> | null = null
    /** Root path key that was fully wave-indexed for search (skip repeat IO). */
    let deepIndexedRootKey: string | null = null
    let deepIndexComplete = false

    /** Expand collapsed drop folders after a short hover while moving. */
    const DRAG_EXPAND_DELAY_MS = 550
    let dragExpandTimer: ReturnType<typeof setTimeout> | null = null
    let dragExpandTargetId: string | null = null

    function clearDragExpandTimer() {
        if (dragExpandTimer) {
            clearTimeout(dragExpandTimer)
            dragExpandTimer = null
        }
        dragExpandTargetId = null
    }

    function clearGitStatus() {
        gitInsideRepo.value = false
        gitStatusByKey.value = new Map()
    }

    async function refreshGitStatus() {
        const root = rootPath.value
        if (!root) {
            clearGitStatus()
            return
        }
        const token = ++gitRefreshToken
        try {
            const result = await fetchLocalGitStatus(root)
            if (token !== gitRefreshToken) return
            gitInsideRepo.value = result.insideRepo
            gitStatusByKey.value = result.map
        } catch {
            if (token !== gitRefreshToken) return
            clearGitStatus()
        }
    }

    function scheduleGitStatusRefresh(immediate = false) {
        if (gitRefreshTimer) {
            clearTimeout(gitRefreshTimer)
            gitRefreshTimer = null
        }
        const run = () => {
            gitRefreshTimer = null
            void refreshGitStatus()
        }
        if (immediate) run()
        else gitRefreshTimer = setTimeout(run, 450)
    }

    function gitStatusFor(path: string, isDirectory: boolean): LocalGitFileStatus | null {
        return lookupLocalGitStatus(gitStatusByKey.value, path, isDirectory)
    }

    function beginTreeDrag(path: string | null) {
        clearDragExpandTimer()
        treeDragSourcePath.value = path
        treeDropTargetId.value = null
    }

    function setTreeDropTarget(targetId: string | null) {
        treeDropTargetId.value = targetId
        if (!targetId) clearDragExpandTimer()
    }

    function scheduleDragExpand(nodeId: string) {
        if (expandedIds.value.has(nodeId)) {
            if (dragExpandTargetId === nodeId) clearDragExpandTimer()
            return
        }
        if (dragExpandTargetId === nodeId) return
        clearDragExpandTimer()
        dragExpandTargetId = nodeId
        dragExpandTimer = setTimeout(() => {
            const id = dragExpandTargetId
            dragExpandTimer = null
            dragExpandTargetId = null
            if (!id || !treeDragSourcePath.value) return
            void ensureExpanded(id)
        }, DRAG_EXPAND_DELAY_MS)
    }

    function endTreeDrag() {
        clearDragExpandTimer()
        treeDragSourcePath.value = null
        treeDropTargetId.value = null
    }

    function needsDeepSearchLoad() {
        return Boolean(searchQuery.value.trim()) || extFilter.value !== 'all'
    }

    function invalidateDeepSearchIndex() {
        deepIndexedRootKey = null
        deepIndexComplete = false
    }

    async function ensureLoadedForSearch() {
        if (!rootPath.value || !needsDeepSearchLoad()) return
        const rootKey = normalizeLocalPathKey(rootPath.value)
        if (deepIndexComplete && deepIndexedRootKey === rootKey) return

        const token = ++searchLoadToken
        searchLoading.value = true
        try {
            const result = await loadLocalTreeForSearch({
                rootPath: rootPath.value,
                maxDirs: SEARCH_LOAD_MAX_DIRS,
                concurrency: SEARCH_LOAD_CONCURRENCY,
                isCancelled: () => token !== searchLoadToken,
                findNodeByPath,
                loadChildren,
                applyChildrenBatch,
            })
            if (token !== searchLoadToken) return
            deepIndexedRootKey = rootKey
            deepIndexComplete = result.complete
        } finally {
            if (token === searchLoadToken) searchLoading.value = false
        }
    }

    function scheduleSearchLoad(immediate = false) {
        if (searchLoadTimer) {
            clearTimeout(searchLoadTimer)
            searchLoadTimer = null
        }
        if (!needsDeepSearchLoad()) {
            searchLoadToken += 1
            contentScanToken += 1
            searchLoading.value = false
            contentHitIds.value = new Set()
            return
        }
        const run = () => {
            searchLoadTimer = null
            void (async () => {
                await ensureLoadedForSearch()
                await runContentScan()
            })()
        }
        if (immediate) run()
        else searchLoadTimer = setTimeout(run, 180)
    }

    async function runContentScan() {
        const token = ++contentScanToken
        if (!searchInContent.value || searchQuery.value.trim().length < 2) {
            contentHitIds.value = new Set()
            return
        }
        searchLoading.value = true
        try {
            const hits = await scanLocalFileContentHits({
                tree: tree.value,
                query: searchQuery.value,
                extFilter: extFilter.value,
                readText: readLocalTextFile,
                maxFiles: CONTENT_SCAN_MAX_FILES,
                concurrency: CONTENT_SCAN_CONCURRENCY,
                isCancelled: () => token !== contentScanToken,
            })
            if (token !== contentScanToken) return
            contentHitIds.value = hits
        } finally {
            if (token === contentScanToken) searchLoading.value = false
        }
    }

    function setSearchQuery(value: string) {
        searchQuery.value = value
        scheduleSearchLoad(false)
    }

    function clearSearchQuery() {
        searchQuery.value = ''
        scheduleSearchLoad(true)
    }

    function setExtFilter(value: LocalFilesExtFilter) {
        extFilter.value = value
        scheduleSearchLoad(true)
    }

    function setSearchInContent(value: boolean) {
        searchInContent.value = value
        if (!value) {
            contentScanToken += 1
            contentHitIds.value = new Set()
            return
        }
        scheduleSearchLoad(true)
    }

    function toggleSearchInContent() {
        setSearchInContent(!searchInContent.value)
    }

    function clearSelection() {
        selectedId.value = null
        selectedIds.value = new Set()
    }

    function select(nodeId: string | null) {
        selectedId.value = nodeId
        selectedIds.value = nodeId ? new Set([nodeId]) : new Set()
    }

    function toggleSelect(nodeId: string) {
        const next = new Set(selectedIds.value)
        if (next.has(nodeId)) next.delete(nodeId)
        else next.add(nodeId)
        selectedIds.value = next
        selectedId.value = next.has(nodeId) ? nodeId : (next.values().next().value ?? null)
    }

    function selectMany(nodeIds: string[], primaryId?: string | null) {
        selectedIds.value = new Set(nodeIds)
        selectedId.value = primaryId ?? nodeIds[nodeIds.length - 1] ?? null
    }

    function isSelected(nodeId: string): boolean {
        return selectedIds.value.has(nodeId)
    }

    /**
     * Re-read folder history from app-config.
     * Store setup may run before syncFromServer; without this, lastRoot/recent stay empty.
     */
    function hydratePreferences() {
        const prefs = readLocalFilesPreferences()
        recentRoots.value = [...prefs.recentRoots]
        favoriteRoots.value = [...prefs.favoriteRoots]
        lastRoot.value = prefs.lastRoot
    }

    function rememberRoot(path: string) {
        const next = [path, ...recentRoots.value.filter((item) => normalizeLocalPathKey(item) !== normalizeLocalPathKey(path))]
        recentRoots.value = next.slice(0, LOCAL_FILES_MAX_RECENT)
        lastRoot.value = path
        persistFolderHistory(recentRoots.value, favoriteRoots.value, lastRoot.value)
    }

    function isFavorite(path: string): boolean {
        const key = normalizeLocalPathKey(path)
        return favoriteRoots.value.some((item) => normalizeLocalPathKey(item) === key)
    }

    function addFavorite(path: string) {
        const trimmed = path.trim()
        if (!trimmed) return
        if (isFavorite(trimmed)) return
        favoriteRoots.value = [trimmed, ...favoriteRoots.value].slice(0, LOCAL_FILES_MAX_FAVORITES)
        persistFolderHistory(recentRoots.value, favoriteRoots.value, lastRoot.value)
    }

    function removeFavorite(path: string) {
        const key = normalizeLocalPathKey(path)
        favoriteRoots.value = favoriteRoots.value.filter((item) => normalizeLocalPathKey(item) !== key)
        persistFolderHistory(recentRoots.value, favoriteRoots.value, lastRoot.value)
    }

    function toggleFavorite(path: string) {
        if (isFavorite(path)) removeFavorite(path)
        else addFavorite(path)
    }

    async function loadChildren(dirPath: string): Promise<LocalFileTreeNode[]> {
        const entries = await listLocalDirectory(dirPath, true)
        return entries.map(entryToNode).filter((node): node is LocalFileTreeNode => Boolean(node))
    }

    function findNode(nodes: LocalFileTreeNode[], id: string): LocalFileTreeNode | null {
        for (const node of nodes) {
            if (node.id === id) return node
            if (node.children?.length) {
                const found = findNode(node.children, id)
                if (found) return found
            }
        }
        return null
    }

    function findNodeByPath(path: string): LocalFileTreeNode | null {
        return findNode(tree.value, localFileNodeId(path))
    }

    /**
     * Replace a node's children immutably (clone ancestors).
     * Required for shallowRef: mutating nested objects in place does not re-render child rows
     * until something else (e.g. a click) forces an update.
     */
    function setNodeChildren(nodeId: string, children: LocalFileTreeNode[]) {
        applyChildrenBatch(new Map([[nodeId, children]]))
    }

    /** One tree commit for many parent→children patches (search wave loads). */
    function applyChildrenBatch(patches: Map<string, LocalFileTreeNode[]>) {
        if (!patches.size) return
        const walk = (nodes: LocalFileTreeNode[]): LocalFileTreeNode[] | null => {
            let changed = false
            const next = nodes.map((node) => {
                const patched = patches.get(node.id)
                let nextChildren = node.children
                let nodeChanged = false
                if (patched) {
                    nextChildren = patched
                    nodeChanged = true
                } else if (node.children?.length) {
                    const updated = walk(node.children)
                    if (updated) {
                        nextChildren = updated
                        nodeChanged = true
                    }
                }
                if (!nodeChanged) return node
                changed = true
                return {
                    ...node,
                    children: nextChildren,
                    loaded: patched ? true : node.loaded,
                }
            })
            return changed ? next : null
        }
        const next = walk(tree.value)
        if (next) tree.value = next
    }

    function plantRoot(path: string, children: LocalFileTreeNode[] = []) {
        const rootId = localFileNodeId(path)
        rootPath.value = path
        tree.value = [makeRootNode(path, children)]
        expandedIds.value = new Set([rootId])
        invalidateDeepSearchIndex()
    }

    async function openRoot(path: string) {
        const trimmed = path.trim()
        if (!trimmed) return
        loading.value = true
        try {
            await registerLocalFilesRoot(trimmed)
            rememberRoot(trimmed)
            clearSearchQuery()
            setExtFilter('all')
            // Always show the workspace root immediately; fill children after list.
            plantRoot(trimmed, [])
            const children = await loadChildren(trimmed)
            plantRoot(trimmed, children)
            clearSelection()
        } catch (error) {
            if (normalizeLocalPathKey(rootPath.value ?? '') === normalizeLocalPathKey(trimmed)) {
                // Keep a visible root row even when listing fails.
                if (!tree.value.length) plantRoot(trimmed, [])
            }
            throw error
        } finally {
            loading.value = false
            scheduleGitStatusRefresh(true)
        }
    }
    async function ensureLastRoot(): Promise<boolean> {
        if (rootPath.value && tree.value.length > 0) return true
        // Store may have been created before syncFromServer filled app-config.localFiles.
        hydratePreferences()
        if (rootPath.value) {
            try {
                await openRoot(rootPath.value)
            } catch {
                return tree.value.length > 0
            }
            return tree.value.length > 0
        }
        const last = lastRoot.value
        if (!last) return false
        try {
            await openRoot(last)
            return tree.value.length > 0
        } catch {
            // Keep a planted root if listing partially succeeded.
            if (tree.value.length > 0) return true
            // Keep lastRoot + recent for manual retry; do not wipe prefs on a single open failure
            // (sandbox / transient list errors are common right after restart).
            return false
        }
    }

    /** Open a recent/last root that contains this absolute path (for tab sync). */
    async function ensureRootForPath(filePath: string): Promise<boolean> {
        hydratePreferences()
        const key = normalizeLocalPathKey(filePath)
        if (rootPath.value) {
            const rootKey = normalizeLocalPathKey(rootPath.value)
            if (key === rootKey || key.startsWith(`${rootKey}/`)) return true
        }
        const candidates = [lastRoot.value, ...recentRoots.value].filter(
            (item): item is string => Boolean(item?.trim()),
        )
        for (const candidate of candidates) {
            const rootKey = normalizeLocalPathKey(candidate)
            if (key === rootKey || key.startsWith(`${rootKey}/`)) {
                await openRoot(candidate)
                return true
            }
        }
        return ensureLastRoot()
    }

    async function pickAndOpenRoot() {
        const path = await pickLocalFilesRoot()
        if (!path) return null
        await openRoot(path)
        return path
    }

    async function refresh() {
        if (!rootPath.value) return
        await openRoot(rootPath.value)
    }

    async function ensureExpanded(nodeId: string) {
        const node = findNode(tree.value, nodeId)
        if (!node?.isDirectory) return
        if (!node.loaded) {
            loading.value = true
            try {
                const children = await loadChildren(node.path)
                setNodeChildren(nodeId, children)
            } finally {
                loading.value = false
            }
        }
        if (expandedIds.value.has(nodeId)) return
        const next = new Set(expandedIds.value)
        next.add(nodeId)
        expandedIds.value = next
    }

    async function toggleExpand(nodeId: string) {
        const node = findNode(tree.value, nodeId)
        if (!node?.isDirectory) return
        const next = new Set(expandedIds.value)
        if (next.has(nodeId)) {
            next.delete(nodeId)
            expandedIds.value = next
            return
        }
        await ensureExpanded(nodeId)
    }

    /** Keep workspace root open; collapse every other folder. */
    function collapseAll() {
        if (!rootPath.value) return
        const rootId = localFileNodeId(rootPath.value)
        expandedIds.value = new Set([rootId])
    }

    async function reveal(path: string) {
        if (!rootPath.value) return false
        const key = normalizeLocalPathKey(path)
        const rootKey = normalizeLocalPathKey(rootPath.value)
        if (key !== rootKey && !key.startsWith(`${rootKey}/`)) {
            return false
        }

        const rootId = localFileNodeId(rootPath.value)
        const ensureExpanded = (id: string) => {
            const next = new Set(expandedIds.value)
            next.add(id)
            expandedIds.value = next
        }
        ensureExpanded(rootId)

        if (key === rootKey) {
            select(rootId)
            flashNodeId.value = rootId
            window.setTimeout(() => {
                if (flashNodeId.value === rootId) flashNodeId.value = null
            }, 1200)
            return true
        }

        const relative = path.slice(rootPath.value.length).replace(/^[/\\]+/, '')
        const parts = relative ? relative.split(/[/\\]/).filter(Boolean) : []
        let cursor = rootPath.value
        for (let i = 0; i < parts.length - 1; i++) {
            cursor = joinLocalPath(cursor, parts[i])
            const id = localFileNodeId(cursor)
            let node = findNodeByPath(cursor)
            if (!node?.loaded) {
                const children = await loadChildren(cursor)
                setNodeChildren(id, children)
                // If parent missing from tree, refresh from root
                if (!findNodeByPath(cursor)) {
                    await refresh()
                }
            }
            ensureExpanded(id)
        }

        const targetId = localFileNodeId(path)
        // Ensure parent folder loaded so the file row exists
        if (parts.length > 0) {
            const parentParts = parts.slice(0, -1)
            let parent = rootPath.value
            for (const part of parentParts) {
                parent = joinLocalPath(parent, part)
            }
            if (parent && normalizeLocalPathKey(parent) !== rootKey) {
                const parentId = localFileNodeId(parent)
                const parentNode = findNodeByPath(parent)
                if (parentNode && !parentNode.loaded) {
                    const children = await loadChildren(parent)
                    setNodeChildren(parentId, children)
                }
            }
        }

        select(targetId)
        flashNodeId.value = targetId
        window.setTimeout(() => {
            if (flashNodeId.value === targetId) flashNodeId.value = null
        }, 1200)
        return true
    }

    async function createFile(parentPath: string, name: string) {
        const target = joinLocalPath(parentPath, name)
        await writeLocalTextFile(target, '')
        await refreshParent(parentPath)
        scheduleGitStatusRefresh()
        return target
    }

    async function createFolder(parentPath: string, name: string) {
        const target = joinLocalPath(parentPath, name)
        await mkdirLocal(target)
        await refreshParent(parentPath)
        scheduleGitStatusRefresh()
        return target
    }

    async function rename(path: string, newName: string) {
        const parent = localFileParentPath(path)
        if (!parent) throw new Error('rename_failed')
        const target = joinLocalPath(parent, newName)
        const next = await renameLocal(path, target)
        await refreshParent(parent)
        scheduleGitStatusRefresh()
        return next
    }

    function remapPathList(list: string[], oldPath: string, newPath: string): string[] {
        const oldKey = normalizeLocalPathKey(oldPath)
        const sep = newPath.includes('\\') && !newPath.includes('/') ? '\\' : '/'
        return list.map((item) => {
            const key = normalizeLocalPathKey(item)
            if (key === oldKey) return newPath
            if (key.startsWith(`${oldKey}/`)) {
                const relative = key.slice(oldKey.length + 1)
                return `${newPath.replace(/[/\\]+$/, '')}${sep}${relative.split('/').join(sep)}`
            }
            return item
        })
    }

    function remapExpandedAfterMove(oldPath: string, newPath: string) {
        const oldKey = normalizeLocalPathKey(oldPath)
        const newKey = normalizeLocalPathKey(newPath)
        if (oldKey === newKey) return
        const next = new Set<string>()
        for (const id of expandedIds.value) {
            if (!id.startsWith('local-file:')) {
                next.add(id)
                continue
            }
            const key = id.slice('local-file:'.length)
            if (key === oldKey) {
                next.add(localFileNodeId(newPath))
            } else if (key.startsWith(`${oldKey}/`)) {
                const relative = key.slice(oldKey.length + 1)
                const sep = newPath.includes('\\') && !newPath.includes('/') ? '\\' : '/'
                next.add(
                    localFileNodeId(
                        `${newPath.replace(/[/\\]+$/, '')}${sep}${relative.split('/').join(sep)}`,
                    ),
                )
            } else {
                next.add(id)
            }
        }
        expandedIds.value = next
    }

    /**
     * Move a file/folder into `targetDirPath` (rename across directories).
     * @returns new absolute path, or null when already in the target directory.
     */
    async function moveInto(sourcePath: string, targetDirPath: string): Promise<string | null> {
        const source = sourcePath.trim()
        const targetDir = targetDirPath.trim()
        if (!source || !targetDir) throw new Error('move_failed')
        if (!canMoveLocalPathInto(source, targetDir, rootPath.value)) {
            throw new Error('invalid_target')
        }

        const oldParent = localFileParentPath(source)
        if (oldParent && normalizeLocalPathKey(oldParent) === normalizeLocalPathKey(targetDir)) {
            return null
        }

        const node = findNodeByPath(source)
        const isDirectory = Boolean(node?.isDirectory)
        const uniqueName = await allocateUniqueChildName(targetDir, localFileBaseName(source), {
            isDirectory,
        })
        const dest = joinLocalPath(targetDir, uniqueName)
        const next = await renameLocal(source, dest)

        remapExpandedAfterMove(source, next)
        favoriteRoots.value = remapPathList(favoriteRoots.value, source, next)
        recentRoots.value = remapPathList(recentRoots.value, source, next)
        if (lastRoot.value) {
            const remappedLast = remapPathList([lastRoot.value], source, next)
            lastRoot.value = remappedLast[0] ?? null
        }
        persistFolderHistory(recentRoots.value, favoriteRoots.value, lastRoot.value)

        if (oldParent) await refreshParent(oldParent)
        await refreshParent(targetDir)
        await ensureDirectoryExpanded(targetDir)
        select(localFileNodeId(next))
        flashNodeId.value = localFileNodeId(next)
        window.setTimeout(() => {
            if (flashNodeId.value === localFileNodeId(next)) flashNodeId.value = null
        }, 1200)
        scheduleGitStatusRefresh()
        return next
    }

    async function remove(path: string, recursive = false) {
        await deleteLocal(path, recursive)
        const deletedKey = normalizeLocalPathKey(path)
        const deletedId = localFileNodeId(path)

        const nextSelected = new Set<string>()
        for (const id of selectedIds.value) {
            if (id === deletedId) continue
            if (!id.startsWith('local-file:')) {
                nextSelected.add(id)
                continue
            }
            const key = id.slice('local-file:'.length)
            if (key === deletedKey || key.startsWith(`${deletedKey}/`)) continue
            nextSelected.add(id)
        }
        selectedIds.value = nextSelected
        if (!selectedId.value || !nextSelected.has(selectedId.value)) {
            selectedId.value = nextSelected.values().next().value ?? null
        }

        if (inlineEdit.value) {
            const draft = inlineEdit.value
            const draftParentKey = normalizeLocalPathKey(draft.parentPath)
            const draftTargetKey = draft.targetPath ? normalizeLocalPathKey(draft.targetPath) : null
            if (
                draftParentKey === deletedKey
                || draftParentKey.startsWith(`${deletedKey}/`)
                || draftTargetKey === deletedKey
                || (draftTargetKey && draftTargetKey.startsWith(`${deletedKey}/`))
            ) {
                inlineEdit.value = null
            }
        }

        const nextExpanded = new Set(
            [...expandedIds.value].filter((id) => {
                if (id === deletedId) return false
                if (!id.startsWith('local-file:')) return true
                const key = id.slice('local-file:'.length)
                return key !== deletedKey && !key.startsWith(`${deletedKey}/`)
            }),
        )
        expandedIds.value = nextExpanded

        const parent = localFileParentPath(path) || rootPath.value
        if (parent) await refreshParent(parent)
        scheduleGitStatusRefresh()
    }

    async function refreshParent(parentPath: string) {
        if (!rootPath.value) return
        const children = await loadChildren(parentPath)
        const id =
            normalizeLocalPathKey(parentPath) === normalizeLocalPathKey(rootPath.value)
                ? localFileNodeId(rootPath.value)
                : localFileNodeId(parentPath)
        setNodeChildren(id, children)
    }

    const selectedNode = computed(() =>
        selectedId.value ? findNode(tree.value, selectedId.value) : null,
    )

    function depthOfPath(absolutePath: string): number {
        if (!rootPath.value) return 0
        const rootKey = normalizeLocalPathKey(rootPath.value)
        const key = normalizeLocalPathKey(absolutePath)
        if (key === rootKey) return 0
        if (!key.startsWith(`${rootKey}/`)) return 0
        return key.slice(rootKey.length + 1).split('/').filter(Boolean).length
    }

    function resolveCreateParentPath(preferred?: string | null): string | null {
        if (preferred?.trim()) return preferred.trim()
        const selected = selectedNode.value
        if (selected?.isDirectory) return selected.path
        if (selected && !selected.isDirectory) {
            return localFileParentPath(selected.path) || rootPath.value
        }
        return rootPath.value
    }

    async function ensureDirectoryExpanded(dirPath: string) {
        const id = localFileNodeId(dirPath)
        let node = findNodeByPath(dirPath)
        if (!node?.isDirectory) return
        if (!node.loaded) {
            const children = await loadChildren(dirPath)
            setNodeChildren(id, children)
            node = findNodeByPath(dirPath)
        }
        const next = new Set(expandedIds.value)
        next.add(id)
        expandedIds.value = next
    }

    function cancelInlineEdit() {
        inlineEdit.value = null
    }

    async function beginCreate(
        mode: 'create-file' | 'create-folder',
        parentPath?: string | null,
        defaults?: {fileName?: string; folderName?: string},
    ) {
        const parent = resolveCreateParentPath(parentPath)
        if (!parent) return false
        await ensureDirectoryExpanded(parent)
        inlineEdit.value = {
            mode,
            parentPath: parent,
            depth: depthOfPath(parent) + 1,
            value: mode === 'create-file'
                ? (defaults?.fileName || 'untitled.txt')
                : (defaults?.folderName || 'New Folder'),
        }
        return true
    }

    function beginRename(node: LocalFileTreeNode) {
        const parent = localFileParentPath(node.path) || rootPath.value
        if (!parent) return false
        inlineEdit.value = {
            mode: 'rename',
            parentPath: parent,
            depth: depthOfPath(node.path),
            value: node.name,
            targetPath: node.path,
            targetId: node.id,
            isDirectory: node.isDirectory,
        }
        return true
    }

    function setInlineEditValue(value: string) {
        if (!inlineEdit.value) return
        inlineEdit.value = {...inlineEdit.value, value}
    }

    /**
     * Commit inline create/rename.
     * @returns created/renamed absolute path, or null when cancelled/invalid
     */
    async function commitInlineEdit(): Promise<string | null> {
        const draft = inlineEdit.value
        if (!draft) return null
        const name = draft.value.trim()
        if (!name || /[/\\]/.test(name)) {
            cancelInlineEdit()
            return null
        }

        if (draft.mode === 'create-file') {
            const fileName = name.includes('.') ? name : `${name}.txt`
            if (isLocalBinaryFileName(fileName)) {
                throw new Error('unsupported_file')
            }
            const uniqueName = await allocateUniqueChildName(draft.parentPath, fileName, {
                isDirectory: false,
            })
            const path = await createFile(draft.parentPath, uniqueName)
            cancelInlineEdit()
            select(localFileNodeId(path))
            return path
        }

        if (draft.mode === 'create-folder') {
            const uniqueName = await allocateUniqueChildName(draft.parentPath, name, {
                isDirectory: true,
            })
            const path = await createFolder(draft.parentPath, uniqueName)
            cancelInlineEdit()
            select(localFileNodeId(path))
            return path
        }

        if (draft.mode === 'rename' && draft.targetPath) {
            if (name === localFileBaseName(draft.targetPath)) {
                cancelInlineEdit()
                return draft.targetPath
            }
            if (!draft.isDirectory && isLocalBinaryFileName(name)) {
                throw new Error('unsupported_file')
            }
            const uniqueName = await allocateUniqueChildName(draft.parentPath, name, {
                isDirectory: Boolean(draft.isDirectory),
                ignoreName: localFileBaseName(draft.targetPath),
            })
            const next = await rename(draft.targetPath, uniqueName)
            cancelInlineEdit()
            select(localFileNodeId(next))
            return next
        }

        cancelInlineEdit()
        return null
    }

    return {
        available,
        rootPath,
        rootName,
        tree,
        expandedIds,
        selectedId,
        selectedIds,
        selectedNode,
        loading,
        flashNodeId,
        recentRoots,
        favoriteRoots,
        inlineEdit,
        searchQuery,
        extFilter,
        searchLoading,
        searchInContent,
        contentHitIds,
        gitInsideRepo,
        gitStatusByKey,
        treeDragSourcePath,
        treeDropTargetId,
        beginTreeDrag,
        setTreeDropTarget,
        endTreeDrag,
        setSearchQuery,
        clearSearchQuery,
        setExtFilter,
        setSearchInContent,
        toggleSearchInContent,
        refreshGitStatus,
        scheduleGitStatusRefresh,
        gitStatusFor,
        clearSelection,
        select,
        toggleSelect,
        selectMany,
        isSelected,
        isFavorite,
        addFavorite,
        removeFavorite,
        toggleFavorite,
        hydratePreferences,
        openRoot,
        ensureLastRoot,
        ensureRootForPath,
        pickAndOpenRoot,
        refresh,
        ensureExpanded,
        toggleExpand,
        collapseAll,
        scheduleDragExpand,
        reveal,
        createFile,
        createFolder,
        rename,
        moveInto,
        remove,
        beginCreate,
        beginRename,
        cancelInlineEdit,
        setInlineEditValue,
        commitInlineEdit,
        findNodeByPath,
        localFileNodeId,
    }
})
