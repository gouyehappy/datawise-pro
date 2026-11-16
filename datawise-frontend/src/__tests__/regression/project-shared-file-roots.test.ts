import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    PROJECT_FILE_ROOTS,
    SHARED_REF_PREFIX,
    buildProjectFileNodeId,
    buildProjectFileUri,
    buildSharedRefPath,
    isDocsProjectFileRoot,
    isProjectFileRoot,
    isScriptsProjectFileRoot,
    isSharedRefPath,
    parseProjectFileUri,
    parseSharedRefPath,
} from '../../features/project/services/project-files-api.ts'
import {
    getVisibleProjectFileRoots,
    setVisibleProjectFileRoots,
} from '../../features/project/services/project-file-root-visibility.ts'
import {
    PROJECT_DOCS_ROOT_ID,
    PROJECT_FILE_ROOT_NODE_IDS,
    PROJECT_SCRIPTS_ROOT_ID,
    isProjectFilesVirtualRootId,
    isShareableProjectFolder,
    isSharedReferenceNode,
    parseProjectFileNodeId,
    projectFileRootFromNodeId,
    projectFilesRootNodeId,
    resolveVisibleProjectFileRoots,
} from '../../features/project/services/project-explorer-files.ts'
import {injectProjectFolderShareMenuItem} from '../../features/explorer/services/explorer-context-menu-builders.service.ts'

const PROJECT_ID = 'proj_default'

describe('project file root model (two private roots)', () => {
    it('exposes exactly two roots — no extra shared roots', () => {
        assert.deepEqual(PROJECT_FILE_ROOTS, ['docs', 'scripts'])
        for (const root of PROJECT_FILE_ROOTS) {
            assert.equal(isProjectFileRoot(root), true)
        }
        assert.equal(isProjectFileRoot('shared-docs'), false)
        assert.equal(isProjectFileRoot('shared-scripts'), false)
        assert.equal(isProjectFileRoot('shared'), false)
    })

    it('round-trips every root through dw-project:// URIs', () => {
        for (const root of PROJECT_FILE_ROOTS) {
            const uri = buildProjectFileUri(PROJECT_ID, root, 'dev/readme.md')
            assert.equal(uri, `dw-project://${PROJECT_ID}/${root}/dev/readme.md`)
            assert.deepEqual(parseProjectFileUri(uri), {
                projectId: PROJECT_ID,
                root,
                path: 'dev/readme.md',
            })
        }
        assert.equal(parseProjectFileUri('dw-project://p/shared-docs/readme.md'), null)
    })

    it('round-trips every root through explorer node ids', () => {
        for (const root of PROJECT_FILE_ROOTS) {
            const nodeId = buildProjectFileNodeId(PROJECT_ID, root, 'dev/readme.md')
            assert.deepEqual(parseProjectFileNodeId(nodeId), {
                projectId: PROJECT_ID,
                root,
                path: 'dev/readme.md',
            })
        }
        assert.equal(parseProjectFileNodeId('project-file:p:team:a.md'), null)
    })

    it('classifies docs vs scripts', () => {
        assert.equal(isDocsProjectFileRoot('docs'), true)
        assert.equal(isDocsProjectFileRoot('scripts'), false)
        assert.equal(isScriptsProjectFileRoot('scripts'), true)
        assert.equal(isScriptsProjectFileRoot('docs'), false)
    })

    it('keeps two distinct virtual root node ids with a 1:1 root mapping', () => {
        assert.deepEqual(PROJECT_FILE_ROOT_NODE_IDS, [
            PROJECT_DOCS_ROOT_ID,
            PROJECT_SCRIPTS_ROOT_ID,
        ])
        for (const root of PROJECT_FILE_ROOTS) {
            const nodeId = projectFilesRootNodeId(root)
            assert.equal(isProjectFilesVirtualRootId(nodeId), true)
            assert.equal(projectFileRootFromNodeId(nodeId), root)
        }
        assert.equal(isProjectFilesVirtualRootId('project-file:p:docs:a.md'), false)
        assert.equal(projectFileRootFromNodeId('project-shared-docs-root'), null)
    })
})

describe('on-demand folder sharing', () => {
    it('builds and parses @shared/u{id}/ virtual paths', () => {
        assert.equal(SHARED_REF_PREFIX, '@shared')
        assert.equal(buildSharedRefPath(7, 'dev/api'), '@shared/u7/dev/api')
        assert.equal(isSharedRefPath('@shared/u7/dev/api'), true)
        assert.equal(isSharedRefPath('dev/api'), false)
        assert.equal(isSharedRefPath('@shared/notanid/x'), false)
        assert.deepEqual(parseSharedRefPath('@shared/u7/dev/api'), {
            ownerUserId: 7,
            path: 'dev/api',
        })
        assert.deepEqual(parseSharedRefPath('@shared/u7'), {ownerUserId: 7, path: ''})
        assert.equal(parseSharedRefPath('dev/api'), null)
    })

    it('shared ref paths survive URI and node-id round trips', () => {
        const path = buildSharedRefPath(3, 'runbooks/deploy.sql')
        const uri = buildProjectFileUri(PROJECT_ID, 'scripts', path)
        assert.deepEqual(parseProjectFileUri(uri), {projectId: PROJECT_ID, root: 'scripts', path})
        assert.deepEqual(parseProjectFileNodeId(buildProjectFileNodeId(PROJECT_ID, 'scripts', path)), {
            projectId: PROJECT_ID,
            root: 'scripts',
            path,
        })
    })

    it('only real private folders can be shared/unshared', () => {
        const privateFolder = {
            id: buildProjectFileNodeId(PROJECT_ID, 'docs', 'dev'),
            label: 'dev',
            type: 'project-docs' as const,
        }
        assert.equal(isShareableProjectFolder(privateFolder), true)
        assert.equal(isShareableProjectFolder({...privateFolder, type: 'project-file'}), false)
        assert.equal(isShareableProjectFolder({...privateFolder, id: PROJECT_DOCS_ROOT_ID}), false)
        assert.equal(isSharedReferenceNode(privateFolder), false)

        const ref = {
            ...privateFolder,
            id: buildProjectFileNodeId(PROJECT_ID, 'docs', '@shared/u1/dev'),
        }
        assert.equal(isSharedReferenceNode(ref), true)
        assert.equal(isShareableProjectFolder(ref), false)
    })

    it('injects a single share/unshare menu action before refresh', () => {
        const base = [
            {id: 'rename-project-file', label: 'Rename'},
            {id: 'refresh-project-files', label: 'Refresh'},
            {id: 'copy-name', label: 'Copy'},
        ]
        const shared = injectProjectFolderShareMenuItem(
            base, 'share-project-folder', 'Share this folder',
        )
        assert.deepEqual(shared.map((item) => item.id), [
            'rename-project-file',
            'share-project-folder',
            'refresh-project-files',
            'copy-name',
        ])
        assert.equal(shared[1]?.icon, 'list-plus')
        const unshared = injectProjectFolderShareMenuItem(
            base, 'unshare-project-folder', 'Stop sharing',
        )
        assert.equal(unshared[1]?.icon, 'list-minus')
        assert.equal(base.length, 3, 'input must not be mutated')
    })
})

describe('settings show/hide for project file roots', () => {
    it('defaults to both roots visible', () => {
        setVisibleProjectFileRoots({docs: undefined, scripts: undefined})
        assert.deepEqual(getVisibleProjectFileRoots(), ['docs', 'scripts'])
        assert.deepEqual(resolveVisibleProjectFileRoots(), ['docs', 'scripts'])
    })

    it('hides each root independently and ignores unknown roots', () => {
        setVisibleProjectFileRoots({docs: false, scripts: true})
        assert.deepEqual(getVisibleProjectFileRoots(), ['scripts'])
        assert.deepEqual(resolveVisibleProjectFileRoots(), ['scripts'])
        assert.deepEqual(resolveVisibleProjectFileRoots(['docs']), ['docs'])
        assert.deepEqual(resolveVisibleProjectFileRoots([]), [])

        setVisibleProjectFileRoots({docs: true, scripts: false})
        assert.deepEqual(getVisibleProjectFileRoots(), ['docs'])

        setVisibleProjectFileRoots(['scripts', 'docs', 'unknown' as 'docs'])
        assert.deepEqual(getVisibleProjectFileRoots(), ['docs', 'scripts'])
    })

    it('accepts an explicit list without touching the stored preference', () => {
        setVisibleProjectFileRoots({docs: false, scripts: false})
        assert.deepEqual(resolveVisibleProjectFileRoots(['scripts']), ['scripts'])
        assert.deepEqual(getVisibleProjectFileRoots(), [])
        setVisibleProjectFileRoots({docs: true, scripts: true})
    })
})
