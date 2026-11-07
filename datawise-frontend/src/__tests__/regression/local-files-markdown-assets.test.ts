import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {collectLocalMarkdownAssetRefs} from '@/features/local-files/services/local-files-markdown-assets'

describe('collectLocalMarkdownAssetRefs', () => {
    it('collects markdown and html relative images, skips remote', () => {
        const refs = collectLocalMarkdownAssetRefs(`
![a](docs/a.png)
<img src="./b.jpg" />
<img src="https://cdn.example/c.png" />
![d](https://cdn.example/d.png)
`)
        assert.deepEqual(refs.sort(), ['./b.jpg', 'docs/a.png'].sort())
    })
})
