import {defineFeature} from '@/core/feature-contract'
import type {LazyViewLoader} from '@/core/registry/create-lazy-view'
import type {WorkspaceTabType} from '@/core/types'

const loadJenkinsWorkbench: LazyViewLoader = () =>
    import('./components/tabs/JenkinsWorkbenchTab.vue')

const JENKINS_TAB_TYPES = ['jenkins-jobs', 'jenkins-nodes'] as const satisfies readonly WorkspaceTabType[]

/** Jenkins workbench tabs — Feature Contract A-15 S2. KeepAlive: JenkinsWorkbenchTab. */
export const jenkinsFeature = defineFeature({
    id: 'workspace-jenkins',
    contributes: {
        tabs: JENKINS_TAB_TYPES.map((type) => ({
            type,
            loader: loadJenkinsWorkbench,
            asyncName: 'JenkinsWorkbenchTab',
        })),
    },
})
