import {describe, expect, it} from 'vitest'
import {workspaceTabIdPrefix} from '@/features/workspace/services/workspace-tab-id'

describe('workspaceTabIdPrefix', () => {
    it('maps config-center and k8s tab types to stable prefixes', () => {
        expect(workspaceTabIdPrefix('nacos-services')).toBe('nacos-services')
        expect(workspaceTabIdPrefix('polaris-configs')).toBe('polaris-configs')
        expect(workspaceTabIdPrefix('k8s-pods')).toBe('k8s-pods')
        expect(workspaceTabIdPrefix('k8s-exec')).toBe('k8s-exec')
        expect(workspaceTabIdPrefix('local-text')).toBe('local-text')
        expect(workspaceTabIdPrefix('view_model_editor')).toBe('vm-editor')
    })

    it('keeps welcome on generic tab prefix', () => {
        expect(workspaceTabIdPrefix('welcome')).toBe('tab')
    })
})
