import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {TreeNode} from '@/core/types'
import {
    findMongoDatabaseNode,
    formatMongoDocumentJson,
    listMongoCollectionsUnderDatabase,
    mongoDocumentLabel,
    rowToMongoDocument,
} from '@/features/workspace/services/mongo-document-view.service'

describe('mongo-document-view.service', () => {
    it('maps grid rows to documents by column name', () => {
        const doc = rowToMongoDocument(
            [
                {key: 'c1', name: '_id'},
                {key: 'c2', name: 'status'},
            ],
            {c1: 'abc', c2: 'active'},
        )
        assert.deepEqual(doc, {_id: 'abc', status: 'active'})
        assert.equal(mongoDocumentLabel(doc, 0), 'abc')
        assert.match(formatMongoDocumentJson(doc), /"status": "active"/)
    })

    it('lists collections under tables folder or database children', () => {
        const withFolder: TreeNode = {
            id: 'db1',
            label: 'demo',
            type: 'database',
            children: [
                {
                    id: 'folder',
                    label: 'tables',
                    type: 'folder',
                    children: [
                        {id: 't1', label: 'users', type: 'table'},
                        {id: 't2', label: 'orders', type: 'table'},
                    ],
                },
            ],
        }
        assert.deepEqual(
            listMongoCollectionsUnderDatabase(withFolder).map((c) => c.name),
            ['orders', 'users'],
        )

        const flat: TreeNode = {
            id: 'db2',
            label: 'demo',
            type: 'database',
            children: [{id: 't3', label: 'logs', type: 'table'}],
        }
        assert.equal(listMongoCollectionsUnderDatabase(flat)[0]?.name, 'logs')

        const connection: TreeNode = {
            id: 'conn',
            label: 'mongo',
            type: 'connection',
            children: [withFolder],
        }
        assert.equal(findMongoDatabaseNode(connection, 'demo')?.id, 'db1')
        assert.equal(mongoDocumentLabel({}, 3), '#4')
    })
})
